from .. import db
from ..utils import json_response

def register(r):
    r.route("GET", "/api/search")(search)

def search(req):
    q = (req.q("q") or "").strip()
    if not q:
        return json_response([])
    rows = db.query(
        """SELECT DISTINCT p.id, p.title, p.status,
                  ts_headline('russian', p.content,
                              plainto_tsquery('russian', %s),
                              'StartSel=<mark>, StopSel=</mark>, MaxFragments=2')
                  AS snippet
           FROM pages p
           LEFT JOIN page_labels pl ON pl.page_id=p.id
           LEFT JOIN labels l ON l.id=pl.label_id
           WHERE p.status='published' AND p.content != ''
             AND (p.title ILIKE %s OR p.content ILIKE %s OR l.name ILIKE %s)
           LIMIT 50""",
        (q, f"%{q}%", f"%{q}%", f"%{q}%"),
    )
    return json_response(rows)
