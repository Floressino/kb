import json
from . import db

def log(user_id, action, entity=None, entity_id=None, details=None):
    try:
        db.execute(
            "INSERT INTO audit_log(user_id,action,entity,entity_id,details) "
            "VALUES(%s,%s,%s,%s,%s)",
            (user_id, action, entity, entity_id, json.dumps(details or {})),
        )
    except Exception as e:
        print("Audit log error:", e)
