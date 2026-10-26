import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "pLjUpNQu8a4YjeCrf2KseA"
os.environ["DENTALLY_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)

EVENTS = [
    "appointment.created", "appointment.updated", "appointment.deleted",
    "patient.created", "patient.updated", "patient.deleted",
    "payment.created", "payment.updated", "payment.deleted",
]


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def payload(event: str) -> bytes:
    return json.dumps(
        {"data": {"id": 2181}, "event": event, "object": event.split(".")[0], "user": {"id": 1}}
    ).encode()


def post(body: bytes, signature=None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Dentally-Signature"] = signature
    return client.post("/webhooks/dentally", content=body, headers=headers)


@pytest.mark.parametrize("event", EVENTS)
def test_accepts_valid_signature(event):
    body = payload(event)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_verifies_regardless_of_content_type():
    body = payload("patient.updated")
    assert post(body, sign(body), content_type="text/plain").status_code == 200


def test_accepts_uppercase_hex_signature():
    body = payload("appointment.created")
    assert post(body, sign(body).upper()).status_code == 200


def test_unknown_event_returns_204():
    body = payload("invoice.created")
    assert post(body, sign(body)).status_code == 204


def test_missing_signature_returns_400():
    assert post(payload("appointment.created")).status_code == 400


def test_wrong_secret_returns_401():
    body = payload("appointment.created")
    assert post(body, sign(body, "wrong-secret")).status_code == 401


def test_tampered_body_returns_401():
    signed = payload("appointment.created")
    assert post(payload("appointment.deleted"), sign(signed)).status_code == 401


@pytest.mark.parametrize(
    "sig",
    ["abc123", "z" * 64, sign(b"x")[:60] + "zzzz", "sha256=" + sign(b"x")],
)
def test_malformed_signature_returns_401(sig):
    assert post(payload("appointment.created"), sig).status_code == 401


def test_non_ascii_signature_returns_401_not_500():
    body = payload("appointment.created")
    res = client.post(
        "/webhooks/dentally",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Dentally-Signature": "é".encode("latin-1"),
        },
    )
    assert res.status_code == 401


def test_invalid_json_returns_400():
    body = b"not json"
    assert post(body, sign(body)).status_code == 400
