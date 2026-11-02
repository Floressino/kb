import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from . import db

def hash_password(password: str):
    # В новой схеме нет отдельного salt, используем чистый sha256
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(password: str, stored_hash: str) -> bool:
    calc = hash_password(password)
    return hmac.compare_digest(calc, stored_hash)

def create_session(user_id: str) -> dict:
    token = secrets.token_hex(32)
    csrf = secrets.token_hex(32)
    expires = datetime.utcnow() + timedelta(hours=12)
    db.execute(
        "INSERT INTO sessions(token,user_id,csrf_token,expires_at) VALUES(%s,%s,%s,%s)",
        (token, user_id, csrf, expires),
    )
    return {"token": token, "csrf": csrf}

def get_session(token: str):
    if not token:
        return None
    # В новой схеме у users нет поля login, используем username
    return db.query(
        """SELECT s.*, u.id AS uid, u.username, u.full_name
           FROM sessions s JOIN users u ON u.id=s.user_id
           WHERE s.token=%s AND s.expires_at > now()""",
        (token,), one=True,
    )

def destroy_session(token: str):
    db.execute("DELETE FROM sessions WHERE token=%s", (token,))

def current_user(environ):
    cookie = environ.get("HTTP_COOKIE", "")
    token = None
    for part in cookie.split(";"):
        k, _, v = part.strip().partition("=")
        if k == "sid":
            token = v
    sess = get_session(token)
    if not sess:
        return None
    roles = [r["code"] for r in db.query(
        """SELECT r.code FROM user_roles ur
           JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=%s""",
        (sess["user_id"],),
    )]
    sess["roles"] = roles
    return sess
