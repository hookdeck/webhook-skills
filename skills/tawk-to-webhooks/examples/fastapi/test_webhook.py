import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_tawk_webhook_secret"
os.environ["TAWK_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha1).hexdigest()


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-tawk-signature"] = signature
    return client.post("/webhooks/tawk-to", content=body, headers=headers)


EVENTS = {
    "chat:start": {"event": "chat:start", "chatId": "c1", "visitor": {"name": "V1"}},
    "chat:end": {"event": "chat:end", "chatId": "c1"},
    "chat:transcript_created": {"event": "chat:transcript_created", "chat": {"id": "c1", "messages": []}},
    "ticket:create": {"event": "ticket:create", "ticket": {"id": "t1", "subject": "Hi"}},
}


@pytest.mark.parametrize("name", list(EVENTS))
def test_accepts_signed_event(name):
    body = json.dumps(EVENTS[name]).encode()
    assert post(body, sign(body)).status_code == 200


def test_verifies_regardless_of_content_type():
    body = json.dumps(EVENTS["chat:start"]).encode()
    assert post(body, sign(body), "text/plain").status_code == 200


def test_accepts_unknown_event():
    body = json.dumps({"event": "other:event"}).encode()
    assert post(body, sign(body)).status_code == 200


def test_rejects_invalid_signature():
    body = json.dumps(EVENTS["chat:start"]).encode()
    assert post(body, sign(body, "wrong")).status_code == 400


def test_rejects_tampered_body_and_short_signature():
    body = json.dumps(EVENTS["chat:start"]).encode()
    assert post(body + b" ", sign(body)).status_code == 400
    assert post(body, "abc").status_code == 400


def test_rejects_missing_signature():
    body = json.dumps(EVENTS["chat:start"]).encode()
    assert post(body).status_code == 400


def test_rejects_signed_invalid_json():
    assert post(b"not json", sign(b"not json")).status_code == 400
