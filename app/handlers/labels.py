from .. import db
from ..utils import json_response

def register(r):
    r.route("GET", "/api/labels")(autocomplete)

def autocomplete(req):
    q = (req.q("q") or "").strip()
    rows = db.query(
        "SELECT name FROM labels WHERE name ILIKE %s ORDER BY name LIMIT 20",
        (f"%{q}%",),
    )
    return json_response([r["name"] for r in rows])
