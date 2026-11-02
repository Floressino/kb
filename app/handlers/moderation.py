from .. import db, rbac, audit
from ..utils import json_response

def register(r):
    r.route("GET", "/api/moderation/queue")(queue)
    r.route("POST", "/api/moderation/submit/<pid>")(submit)
    r.route("POST", "/api/moderation/take/<rid>")(take)
    r.route("POST", "/api/moderation/decide/<rid>")(decide)

def submit(req, pid):
    rbac.require(req.user, "author", "admin", "employee", "god")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]: raise PermissionError("CSRF")
    
    p = db.query("SELECT * FROM pages WHERE id=%s::uuid", (pid,), one=True)
    if not p: return json_response({"error": "Нет страницы"}, "404 Not Found")
    
    # Ставим статус "pending" (на модерации)
    db.execute("UPDATE pages SET status='draft' WHERE id=%s::uuid", (p["id"],))
    
    rid = db.query(
        "INSERT INTO moderation_requests(page_id, created_by, status) VALUES(%s::uuid, %s::uuid, 'pending') RETURNING id",
        (p["id"], req.user["user_id"]), one=True,
    )["id"]
    
    audit.log(req.user["user_id"], "moderation.submit", "page", str(p["id"]))
    return json_response({"request_id": rid})

def queue(req):
    rbac.require(req.user, "moderator", "admin", "manager", "eol", "god")
    rows = db.query(
        """SELECT mr.id, mr.status, mr.assigned_at, 
                  p.id AS page_id, p.title,
                  u.display_name AS author, 
                  m.display_name AS moderator,
                  mr.assigned_moderator_id
           FROM moderation_requests mr
           JOIN pages p ON p.id=mr.page_id
           JOIN users u ON u.id=mr.created_by
           LEFT JOIN users m ON m.id=mr.assigned_moderator_id
           WHERE mr.status IN ('pending','in_progress')
           ORDER BY mr.created_at"""
    )
    return json_response(rows)

def take(req, rid):
    rbac.require(req.user, "moderator", "admin", "manager", "eol", "god")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]: raise PermissionError("CSRF")
    
    row = db.query("SELECT * FROM moderation_requests WHERE id=%s::uuid", (rid,), one=True)
    if not row: return json_response({"error": "Заявка не найдена"}, "404 Not Found")
    
    db.execute(
        "UPDATE moderation_requests SET assigned_moderator_id=%s::uuid, assigned_at=now(), status='in_progress' WHERE id=%s::uuid",
        (req.user["user_id"], rid),
    )
    audit.log(req.user["user_id"], "moderation.take", "request", str(rid))
    return json_response({"ok": True})

def decide(req, rid):
    rbac.require(req.user, "moderator", "admin", "manager", "eol", "god")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]: raise PermissionError("CSRF")
    action = data.get("action")
    
    row = db.query("SELECT * FROM moderation_requests WHERE id=%s::uuid", (rid,), one=True)
    if not row: return json_response({"error": "Нет заявки"}, "404 Not Found")
    
    if action == "approve":
        db.execute("UPDATE moderation_requests SET status='approved', updated_at=now() WHERE id=%s::uuid", (rid,))
        db.execute("UPDATE pages SET status='published' WHERE id=%s::uuid", (row["page_id"],))
    elif action == "reject":
        comment = (data.get("comment") or "").strip()
        if not comment: return json_response({"error": "Нужен комментарий"}, "400 Bad Request")
        db.execute(
            "UPDATE moderation_requests SET status='rejected', rejection_comment=%s, updated_at=now() WHERE id=%s::uuid",
            (comment, rid),
        )
        db.execute("UPDATE pages SET status='draft' WHERE id=%s::uuid", (row["page_id"],))
        
    audit.log(req.user["user_id"], f"moderation.{action}", "request", str(rid))
    return json_response({"ok": True})
