from .. import db, rbac, audit, auth
from ..utils import json_response
import time

_spaces_cache = { 'time': 0, 'data': [] }

def register(r):
    r.route("POST", "/api/admin/users")(create_user)
    r.route("GET", "/api/admin/users")(list_users)
    r.route("PUT", "/api/admin/users/<uid>/roles")(set_roles)
    r.route("DELETE", "/api/admin/users/<uid>")(delete_user)
    r.route("POST", "/api/admin/spaces")(create_space)
    r.route("GET", "/api/admin/spaces")(list_spaces)
    r.route("PUT", "/api/admin/profile")(update_profile)
    r.route("GET", "/api/admin/avatar")(get_avatar)
    r.route("POST", "/api/login")(login)
    r.route("POST", "/api/logout")(logout)
    r.route("GET", "/api/me")(me)

def login(req):
    data = req.json()
    u = db.query("SELECT * FROM users WHERE username=%s", (data.get("login"),), one=True)
    if not u or not u["is_active"] or not auth.verify_password(data.get("password", ""), u["password_hash"]):
        return json_response({"error": "Неверный логин или пароль"}, "401 Unauthorized")
    
    sess = auth.create_session(u["id"])
    return json_response(
        {"ok": True, "csrf": sess["csrf"], "user": {"id": u["id"], "login": u["username"], "full_name": u["display_name"]}},
        headers=[("Set-Cookie", f"sid={sess['token']}; HttpOnly; Path=/; SameSite=Lax")],
    )

def logout(req):
    if req.cookies.get("sid"):
        auth.destroy_session(req.cookies["sid"])
    return json_response({"ok": True}, headers=[("Set-Cookie", "sid=; Max-Age=0; Path=/")])

def me(req):
    if not req.user: 
        return json_response({"user": None})
        
    u = db.query("SELECT id, username, display_name, full_name FROM users WHERE id=%s::uuid", (req.user["user_id"],), one=True)
    roles_rows = db.query(
        "SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = %s::uuid", 
        (req.user["user_id"],)
    )
    roles = [r["code"] for r in roles_rows]
    
    return json_response({"user": {
        "id": u["id"], 
        "login": u["username"],
        "full_name": u["display_name"] or u["full_name"], 
        "roles": roles,
        "csrf": req.user["csrf_token"], 
    }})

def get_avatar(req):
    if not req.user: return json_response({"avatar_url": None})
    u = db.query("SELECT avatar_url FROM users WHERE id=%s::uuid", (req.user["user_id"],), one=True)
    return json_response({"avatar_url": u["avatar_url"] if u else None})

def update_profile(req):
    if not req.user: raise PermissionError("Не авторизован")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]: raise PermissionError("CSRF")
    avatar_base64 = data.get("avatar_url")
    db.execute("UPDATE users SET avatar_url=%s WHERE id=%s::uuid", (avatar_base64, req.user["user_id"]))
    return json_response({"ok": True, "avatar_url": avatar_base64})

def create_user(req):
    rbac.require(req.user, "admin", "god")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]: raise PermissionError("CSRF")
    
    uid = db.query(
        "INSERT INTO users(email, username, display_name, full_name, password_hash, department_id) "
        "VALUES(%s, %s, %s, %s, %s, %s::uuid) RETURNING id",
        (data["login"] + "@local", data["login"], data["full_name"], data["full_name"], auth.hash_password(data["password"]), data.get("department_id") or None), 
        one=True,
    )["id"]
    
    for role_code in data.get("roles", ["employee"]):
        db.execute("INSERT INTO user_roles(user_id,role_id) SELECT %s::uuid,id FROM roles WHERE code=%s", (uid, role_code))
    
    audit.log(req.user["user_id"], "user.create", "user", str(uid))
    return json_response({"id": uid})

def list_users(req):
    rbac.require(req.user, "admin", "god")
    rows = db.query(
        """SELECT u.id, u.username AS login, u.full_name, 
                  CASE WHEN u.is_active THEN 'active' ELSE 'blocked' END AS status,
                  u.department_id,
                  d.name AS department_name,
                  COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles
           FROM users u
           LEFT JOIN user_roles ur ON ur.user_id=u.id
           LEFT JOIN roles r ON r.id=ur.role_id
           LEFT JOIN departments d ON d.id = u.department_id
           GROUP BY u.id, d.name ORDER BY u.username"""
    )
    return json_response(rows)

def set_roles(req, uid):
    rbac.require(req.user, "admin", "god")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]: raise PermissionError("CSRF")
    db.execute("DELETE FROM user_roles WHERE user_id=%s::uuid", (uid,))
    for code in data.get("roles", []):
        db.execute("INSERT INTO user_roles(user_id,role_id) SELECT %s::uuid,id FROM roles WHERE code=%s", (uid, code))
    audit.log(req.user["user_id"], "user.roles", "user", str(uid))
    return json_response({"ok": True})

def delete_user(req, uid):
    rbac.require(req.user, "admin", "god")
    if req.user["user_id"] == uid:
        return json_response({"error": "Нельзя удалить самого себя"}, "400 Bad Request")
    db.execute("DELETE FROM user_roles WHERE user_id=%s::uuid", (uid,))
    db.execute("DELETE FROM users WHERE id=%s::uuid", (uid,))
    audit.log(req.user["user_id"], "user.delete", "user", str(uid))
    return json_response({"ok": True})

def create_space(req):
    rbac.require(req.user, "admin", "author", "moderator", "god")
    data = req.json()
    if data.get("csrf") != req.user["csrf_token"]: raise PermissionError("CSRF")
    
    name = data["name"].strip()
    existing = db.query("SELECT id FROM departments WHERE name=%s", (name,), one=True)
    if existing: return json_response({"id": existing["id"]})
        
    safe_key = "".join(c for c in name if c.isalnum()).upper()[:10]
    if not safe_key: safe_key = "SPC"

    sid = db.query(
        "INSERT INTO departments(name, code) VALUES(%s, %s) RETURNING id", 
        (name, safe_key), one=True
    )["id"]
    
    _spaces_cache['time'] = 0 # Сброс кэша
    return json_response({"id": sid})

def list_spaces(req):
    now = time.time()
    if now - _spaces_cache['time'] < 10 and _spaces_cache['data']:
        return json_response(_spaces_cache['data'])
    try:
        data = db.query("SELECT id, name FROM departments ORDER BY name")
        _spaces_cache['time'] = now
        _spaces_cache['data'] = data
        return json_response(data)
    except Exception:
        return json_response([])
