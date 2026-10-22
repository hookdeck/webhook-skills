import base64
import hashlib
import hmac
import json
import os

os.environ["DESCOPE_WEBHOOK_SECRET"] = "test_descope_hmac_secret"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
SECRET = "test_descope_hmac_secret"

EVENTS = [
    {"action": "LoginSucceed", "actorId": "U1", "userId": "U1", "projectId": "P1", "loginIds": ["a@b.com"], "occurred": 1780949905843, "data": {}},
    {"action": "UserModified", "actorId": "U1", "userId": "U2", "projectId": "P1", "loginIds": ["c@d.com"], "occurred": 1780949905900, "data": {}},
    {"action": "Change Password", "actorId": "U1", "userId": "U1", "projectId": "P1", "occurred": 1780949905999, "data": {}},
]
BODY = json.dumps(EVENTS)


def sign(body: str, secret: str = SECRET) -> str:
    # Descope: base64 HMAC-SHA256 of the JSON string it sends
    return base64.b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).decode()


def post(body: str, headers=None):
    return client.post("/webhooks/descope", content=body, headers=headers or {})


def test_valid_signature_batch():
    r = post(BODY, {"content-type": "application/json", "x-descope-webhook-s256": sign(BODY)})
    assert r.status_code == 200
    assert r.json() == {"received": True, "count": 3}


def test_any_content_type():
    r = post(BODY, {"content-type": "text/plain", "x-descope-webhook-s256": sign(BODY)})
    assert r.status_code == 200


def test_wrong_secret():
    r = post(BODY, {"x-descope-webhook-s256": sign(BODY, "other")})
    assert r.status_code == 400


def test_tampered_body():
    r = post(BODY.replace("LoginSucceed", "LoginFailed"), {"x-descope-webhook-s256": sign(BODY)})
    assert r.status_code == 400


def test_missing_header():
    assert post(BODY).status_code == 400


def test_malformed_signature():
    r = post(BODY, {"x-descope-webhook-s256": "not-a-signature!"})
    assert r.status_code == 400


def test_invalid_json_signed():
    bad = "{not json"
    r = post(bad, {"x-descope-webhook-s256": sign(bad)})
    assert r.status_code == 400
