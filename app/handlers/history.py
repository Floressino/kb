import json
from .. import db, rbac, audit
from ..utils import json_response

def register(r):
    r.route("GET", "/api/pages/<pid>/history")(list_hist)
    r.route("POST", "/api/pages/<pid>/restore/<vid>")(restore)

def list_hist(req, pid):
    rows = db.query(
        "SELECT id, version, editor_id, created_at FROM page_revisions WHERE page_id=%s::uuid ORDER BY version DESC",
        (pid,),
    )
    return json_response(rows)

def restore(req, pid, vid):
    rbac.require(req.user, "author", "admin")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]: raise PermissionError("CSRF")
    
    v = db.query(
        """SELECT id, title, content->>'html' AS html_content 
           FROM page_revisions WHERE id=%s::uuid AND page_id=%s::uuid""", 
        (vid, pid), one=True
    )
    if not v: raise PermissionError("Версия не найдена")
    
    p = db.query("SELECT current_version FROM pages WHERE id=%s::uuid", (pid,), one=True)
    new_version = p["current_version"] + 1

    db.execute("UPDATE pages SET title=%s, current_version=%s, updated_by=%s::uuid, updated_at=now() WHERE id=%s::uuid",
               (v["title"], new_version, req.user["user_id"], pid))
    
    db.execute(
        "INSERT INTO page_revisions(page_id, version, title, content, editor_id) VALUES(%s::uuid, %s, %s, %s::jsonb, %s::uuid)",
        (pid, new_version, v["title"], json.dumps({"html": v["html_content"] or ""}), req.user["user_id"])
    )
    
    audit.log(req.user["user_id"], "page.restore", "page", str(pid), {"restored_from_version": v["version"]})
    return json_response({"ok": True})
