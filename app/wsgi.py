import json
import mimetypes
import os
import traceback

from .router import Router, Request, Response
from . import handlers

app_router = Router()
handlers.register(app_router)

STATIC_DIR = os.environ.get("STATIC_DIR", "/opt/kb/static")
STORAGE_DIR = os.environ.get("STORAGE_DIR", "/var/lib/kb/attachments")

def serve_file(req):
    if req.path.startswith("/static/"):
        base = STATIC_DIR
        rel = req.path[len("/static/"):]
    else:
        base = STORAGE_DIR
        rel = req.path[len("/attachments/"):]
    path = os.path.normpath(os.path.join(base, rel))
    if not path.startswith(os.path.abspath(base)) or not os.path.isfile(path):
        return Response("Not Found", "404 Not Found")
    ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        return Response(f.read(), "200 OK", ctype)

def application(environ, start_response):
    req = Request(environ)
    try:
        if req.path.startswith("/static/") or req.path.startswith("/attachments/"):
            resp = serve_file(req)
        elif req.path in ("/", "/index.html"):
            index_path = os.path.join(STATIC_DIR, "index.html")
            with open(index_path, "rb") as f:
                resp = Response(f.read(), "200 OK", "text/html; charset=utf-8")
        else:
            resp = app_router.dispatch(req)
    except PermissionError as e:
        resp = Response(
            json.dumps({"error": str(e)}, ensure_ascii=False),
            "403 Forbidden", "application/json; charset=utf-8",
        )
    except Exception:
        traceback.print_exc()
        resp = Response(
            json.dumps({"error": "internal"}),
            "500 Internal Server Error", "application/json",
        )
    start_response(resp.status, resp.headers)
    return [resp.body]
