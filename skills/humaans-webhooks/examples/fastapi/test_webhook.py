import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Humaans signing secrets are 'whsec_' + base64-encoded key bytes
WEBHOOK_SECRET = "whsec_" + base64.b64encode(b"test_humaans_signing_secret_key").decode()
os.environ["HUMAANS_WEBHOOK_SECRET"] = WEBHOOK_SECRET

from main import app  # noqa: E402

client = TestClient(app)

MSG_ID = "msg_2lXyZ3AbCdEfGhIjKlMnOpQrSt"

BASE = {
    "id": "qCNHkhApepOJf0eFHuPzQbDg",
    "seq": "01J4GSN4XYQ7401FXCYQPWH3V7",
    "ts": "2024-08-05T08:14:24.190Z",
    "subject": {"id": "8Rc7dFxm7OFoiwxVBIFrLRAi", "type": "person"},
    "actor": {"personId": "8Rc7dFxm7OFoiwxVBIFrLRAi", "type": "person"},
    "entity": {
        "id": "OCPMqZtTcgFOuoc56TiKo9OT",
        "fieldsChanged": ["name"],
        "next": {"name": "jane"},
        "prev": {"name": None},
        "customFields": [],
        "metadata": {},
    },
}


def event(action: str) -> dict:
    return {**BASE, "action": action}


def sign(body: str, msg_id: str, timestamp: int, secret: str = WEBHOOK_SECRET) -> str:
    """Sign exactly as Humaans (Svix / Standard Webhooks) does:
    base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
    """
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def post(payload, *, timestamp=None, signature=None, secret=WEBHOOK_SECRET, omit=None,
         send_body=None, content_type="application/json", prefix="webhook"):
    body = json.dumps(payload)
    ts = timestamp if timestamp is not None else int(time.time())
    headers = {
        "content-type": content_type,
        f"{prefix}-id": MSG_ID,
        f"{prefix}-timestamp": str(ts),
        f"{prefix}-signature": signature or sign(body, MSG_ID, ts, secret),
    }
    if omit:
        del headers[omit]
    return client.post("/webhooks/humaans", content=send_body or body, headers=headers)


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("HUMAANS_WEBHOOK_SECRET", WEBHOOK_SECRET)


@pytest.mark.parametrize(
    "action",
    [
        "person.created",
        "person.updated",
        "person.offboarded",
        "timeAway.created",
        "timeAway.approved",
        "compensation.updated",
        "equipment.deleted",
    ],
)
def test_accepts_signed_event(action):
    res = post(event(action))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_svix_headers():
    assert post(event("person.created"), prefix="svix").status_code == 200


def test_accepts_any_content_type():
    assert post(event("person.created"), content_type="text/plain").status_code == 200


def test_accepts_when_one_of_several_signatures_matches():
    ts = int(time.time())
    good = sign(json.dumps(event("person.created")), MSG_ID, ts)
    res = post(event("person.created"), timestamp=ts, signature=f"v1,aW52YWxpZHNpZ25hdHVyZQ== {good}")
    assert res.status_code == 200


def test_rejects_invalid_signature():
    assert post(event("person.created"), signature="v1,aW52YWxpZHNpZ25hdHVyZQ==").status_code == 400


def test_rejects_signature_from_different_secret():
    other = "whsec_" + base64.b64encode(b"some_other_secret").decode()
    assert post(event("person.created"), secret=other).status_code == 400


def test_rejects_tampered_body():
    tampered = json.dumps(event("person.deleted"))
    assert post(event("person.created"), send_body=tampered).status_code == 400


def test_rejects_old_timestamp():
    assert post(event("person.created"), timestamp=int(time.time()) - 600).status_code == 400


@pytest.mark.parametrize("header", ["webhook-id", "webhook-timestamp", "webhook-signature"])
def test_rejects_missing_header(header):
    assert post(event("person.created"), omit=header).status_code == 400


def test_returns_500_without_secret(monkeypatch):
    monkeypatch.delenv("HUMAANS_WEBHOOK_SECRET")
    assert post(event("person.created")).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
