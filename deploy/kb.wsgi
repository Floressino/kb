import os
import sys

PROJECT_ROOT = "/opt/kb"
sys.path.insert(0, PROJECT_ROOT)

os.environ.setdefault(
    "DATABASE_URL",
    "host=127.0.0.1 dbname=app user=kb_users password=trustmeall port=5432",
)
os.environ.setdefault("STATIC_DIR", f"{PROJECT_ROOT}/static")
os.environ.setdefault("STORAGE_DIR", "/var/lib/kb/attachments")

from app.wsgi import application  # noqa: E402
