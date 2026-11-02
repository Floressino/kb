import json

from .router import Response

def json_response(obj, status="200 OK", headers=None):
    return Response(
        json.dumps(obj, ensure_ascii=False, default=str),
        status,
        "application/json; charset=utf-8",
        headers=headers,
    )
