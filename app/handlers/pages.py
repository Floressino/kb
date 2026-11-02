import json
import secrets
import uuid
import time

from ..router import Response
from .. import db, rbac, audit
from ..utils import json_response

_cache = {}

def register(r):
    r.route("GET", "/api/tree")(tree)
    r.route("GET", "/api/pages/<pid>")(get_page)
    r.route("POST", "/api/pages")(create_page)
    r.route("PUT", "/api/pages/<pid>")(update_page)
    r.route("DELETE", "/api/pages/<pid>")(delete_page)

def tree(req):
    uid = (req.user or {}).get("user_id", "00000000-0000-0000-0000-000000000000")
    cache_key = f"tree_{uid}"
    
    now = time.time()
    if cache_key in _cache and now - _cache[cache_key][0] < 5:
        return json_response(_cache[cache_key][1])

    rows = db.query(
        """SELECT p.id, p.title, p.parent_id, p.space_id, p.status, p.created_by,
                  COALESCE(r.content->>'html', '') AS content
           FROM pages p
           LEFT JOIN page_revisions r ON r.page_id = p.id AND r.version = p.current_version
           WHERE (p.status='published' OR p.created_by=%s::uuid) 
             AND p.title != 'Временные файлы (скрыто)'
           ORDER BY p.title""",
        (uid,),
    )
    
    _cache[cache_key] = (now, rows)
    return json_response(rows)

def get_page(req, pid):
    try:
        uuid.UUID(pid)
    except ValueError:
        return Response(json.dumps({"error": "not found"}), "404 Not Found", "application/json")

    p = db.query(
        """SELECT p.*, COALESCE(r.content->>'html', '') AS content
           FROM pages p
           LEFT JOIN page_revisions r ON r.page_id = p.id AND r.version = p.current_version
           WHERE p.id=%s::uuid""", 
        (pid,), one=True
    )
    if not p:
        return Response(json.dumps({"error": "not found"}), "404 Not Found", "application/json")
    
    if p["status"] != "published":
        uid = (req.user or {}).get("user_id")
        if not req.user or (uid != p["created_by"] and not rbac.has_role(req.user, "moderator", "admin", "god", "eol", "manager")):
            return Response(json.dumps({"error": "forbidden"}), "403 Forbidden", "application/json")
    
    labels = db.query(
        "SELECT l.name FROM page_labels pl JOIN labels l ON l.id=pl.label_id WHERE pl.page_id=%s::uuid",
        (p["id"],),
    )
    p["labels"] = [l["name"] for l in labels]
    return json_response(p)

def _check_csrf(req):
    if not req.user:
        raise PermissionError("Не авторизован")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]:
        raise PermissionError("CSRF")
    return data

def _get_or_create_space(space_path, user_id):
    name = space_path.strip().split("/")[-1].strip()
    if not name: name = "Общее"
    
    row = db.query("SELECT id FROM departments WHERE name=%s", (name,), one=True)
    if row: return row["id"]
    
    safe_key = "".join(c for c in name if c.isalnum()).upper()[:10]
    if not safe_key: safe_key = "SPC"
    
    return db.query(
        "INSERT INTO departments(name, code) VALUES(%s, %s) RETURNING id",
        (name, safe_key), one=True,
    )["id"]

def create_page(req):
    rbac.require(req.user, "author", "admin", "employee", "god")
    data = _check_csrf(req)
    
    space_path = data.get("space_path", "Общее")
    space_id = _get_or_create_space(space_path, req.user["user_id"])
    
    parent_id = data.get("parent_id")
    if parent_id == "" or parent_id is None:
        parent_id = None

    pid = db.query(
        "INSERT INTO pages(space_id,parent_id,title,created_by,status,current_version) "
        "VALUES(%s::uuid,%s::uuid,%s,%s::uuid,'draft', 1) RETURNING id",
        (space_id, parent_id, data["title"], req.user["user_id"]),
        one=True,
    )["id"]
    
    db.execute(
        "INSERT INTO page_revisions(page_id, version, title, content, editor_id) "
        "VALUES(%s::uuid, 1, %s, %s::jsonb, %s::uuid)",
        (pid, data["title"], json.dumps({"html": data.get("content", "")}), req.user["user_id"])
    )
    
    _sync_labels(pid, data.get("labels", []))
    audit.log(req.user["user_id"], "page.create", "page", str(pid))
    _cache.clear()
    return json_response({"id": pid})

def update_page(req, pid):
    try:
        uuid.UUID(pid)
    except ValueError:
        raise PermissionError("Неверный формат ID")

    p = db.query("SELECT * FROM pages WHERE id=%s::uuid", (pid,), one=True)
    if not p: raise PermissionError("Нет страницы")
    uid = req.user["user_id"]
    if p["created_by"] != uid and not rbac.has_role(req.user, "admin", "god", "eol", "manager"):
        raise PermissionError("Нельзя редактировать чужую статью")
    
    data = _check_csrf(req)
    
    space_path = data.get("space_path")
    if space_path:
        space_id = _get_or_create_space(space_path, uid)
    else:
        space_id = p["space_id"]

    new_version = p["current_version"] + 1
    parent_id = data.get("parent_id", p["parent_id"])
    if parent_id == "" or parent_id is None:
        parent_id = None

    db.execute(
        "UPDATE pages SET title=%s, parent_id=%s::uuid, space_id=%s::uuid, updated_by=%s::uuid, current_version=%s, updated_at=now() WHERE id=%s::uuid",
        (data.get("title", p["title"]), parent_id, space_id, uid, new_version, pid),
    )
    
    db.execute(
        "INSERT INTO page_revisions(page_id, version, title, content, editor_id) "
        "VALUES(%s::uuid, %s, %s, %s::jsonb, %s::uuid)",
        (pid, new_version, data.get("title", p["title"]), json.dumps({"html": data.get("content", "")}), uid)
    )

    if "labels" in data:
        _sync_labels(p["id"], data["labels"])
    audit.log(uid, "page.update", "page", str(pid))
    _cache.clear()
    return json_response({"ok": True})

def delete_page(req, pid):
    try:
        uuid.UUID(pid)
    except ValueError:
        raise PermissionError("Неверный формат ID")

    p = db.query("SELECT * FROM pages WHERE id=%s::uuid", (pid,), one=True)
    if not p: raise PermissionError("Нет страницы")
    
    # РАЗРЕШАЕМ УДАЛЕНИЕ МОДЕРАТОРАМ И БОГАМ
    if p["created_by"] != req.user["user_id"] and not rbac.has_role(req.user, "admin", "god", "eol", "manager", "moderator"):
        raise PermissionError("Нельзя удалять чужую статью")
    
    # Удаляем заявку на модерацию (если есть)
    db.execute("DELETE FROM moderation_requests WHERE page_id=%s::uuid", (pid,))
    
    # Удаляем саму статью
    db.execute("DELETE FROM pages WHERE id=%s::uuid", (pid,))
    
    audit.log(req.user["user_id"], "page.delete", "page", str(pid))
    _cache.clear()
    return json_response({"ok": True})

def _sync_labels(page_id, names):
    db.execute("DELETE FROM page_labels WHERE page_id=%s::uuid", (page_id,))
    for name in {n.strip().lower() for n in names if n.strip()}:
        row = db.query("SELECT id FROM labels WHERE name=%s", (name,), one=True)
        if not row:
            row = db.query("INSERT INTO labels(name) VALUES(%s) RETURNING id", (name,), one=True)
        db.execute("INSERT INTO page_labels(page_id,label_id) VALUES(%s::uuid,%s::uuid) ON CONFLICT DO NOTHING", (page_id, row["id"]))
