import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Duffel secrets look base64 but are used as raw strings; this one is only for tests
SECRET = "54vFWvaSbbzYpxXPeB4YEw=="
os.environ["DUFFEL_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    v1 = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={ts},v1={v1}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["X-Duffel-Signature"] = signature
    return client.post("/webhooks/duffel", content=body, headers=headers)


def event(type_: str) -> str:
    return json.dumps(
        {
            "id": "wev_0000A6VP9fgKxAccTSKWUy",
            "type": type_,
            "live_mode": False,
            "idempotency_key": "aic_0000ApoiwggSbt7BordU1o",
            "created_at": "2021-04-22T13:13:18.420272Z",
            "data": {"object": {"id": "ord_0000A1"}},
        }
    )


@pytest.mark.parametrize(
    "type_",
    [
        "ping.triggered",
        "order.created",
        "order.airline_initiated_change_detected",
        "order_cancellation.confirmed",
        "payment.succeeded",
        "order.unknown",
    ],
)
def test_accepts_valid_signature(type_):
    body = event(type_)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_uses_secret_as_is_not_base64_decoded():
    import base64

    body = event("order.created")
    v1 = hmac.new(base64.b64decode(SECRET), f"1616202842.{body}".encode(), hashlib.sha256).hexdigest()
    assert post(body, f"t=1616202842,v1={v1}").status_code == 400


def test_verifies_any_content_type():
    body = event("order.created")
    assert post(body, sign(body), "text/plain").status_code == 200


def test_rejects_tampered_body():
    body = event("order.created")
    assert post(body.replace("ord_0000A1", "ord_evil"), sign(body)).status_code == 400


def test_rejects_wrong_secret():
    body = event("order.created")
    assert post(body, sign(body, secret="other_secret")).status_code == 400


def test_rejects_missing_signature():
    assert post(event("order.created")).status_code == 400


def test_rejects_malformed_signature():
    assert post(event("order.created"), "garbage").status_code == 400


def test_rejects_signature_of_different_length():
    assert post(event("order.created"), "t=1616202842,v1=abcd").status_code == 400


def test_rejects_invalid_json_with_valid_signature():
    body = "not json"
    assert post(body, sign(body)).status_code == 400


def test_accepts_old_timestamp_by_default():
    body = event("order.created")
    assert post(body, sign(body, int(time.time()) - 86400)).status_code == 200


class TestTimestampTolerance:
    @pytest.fixture(autouse=True)
    def tolerance(self, monkeypatch):
        monkeypatch.setenv("DUFFEL_TIMESTAMP_TOLERANCE_SECONDS", "300")

    def test_rejects_old_timestamp(self):
        body = event("order.created")
        assert post(body, sign(body, int(time.time()) - 3600)).status_code == 400

    def test_accepts_fresh_timestamp(self):
        body = event("order.created")
        assert post(body, sign(body)).status_code == 200
