import base64
import hashlib
import hmac
import json
import os
import time

import pytest

# Luma secrets start with whsec_ and are used whole as a UTF-8 key (NOT base64-decoded)
SECRET = "whsec_test_secret_123"
os.environ["LUMA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_luma_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str | bytes = SECRET, t: int | None = None) -> str:
    t = int(time.time()) if t is None else t
    key = secret if isinstance(secret, bytes) else secret.encode()
    v1 = hmac.new(key, f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def event(event_type: str, data=None) -> dict:
    return {"type": event_type, "data": data if data is not None else {}}


def post(body: str, header: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if header:
        headers["Webhook-Signature"] = header
    return client.post("/webhooks/luma", content=body, headers=headers)


BODY = json.dumps(event("guest.registered"))


class TestVerify:
    def test_accepts_valid_signature(self):
        assert verify_luma_webhook(BODY.encode(), sign(BODY), SECRET)

    def test_uses_whole_secret_not_stripped_or_decoded(self):
        stripped = SECRET[len("whsec_"):]
        assert not verify_luma_webhook(BODY.encode(), sign(BODY, stripped), SECRET)
        try:
            decoded = base64.b64decode(stripped + "=" * (-len(stripped) % 4))
        except Exception:
            decoded = stripped.encode()
        assert not verify_luma_webhook(BODY.encode(), sign(BODY, decoded), SECRET)

    def test_rejects_wrong_secret(self):
        assert not verify_luma_webhook(BODY.encode(), sign(BODY, "whsec_other"), SECRET)

    def test_rejects_tampered_body(self):
        assert not verify_luma_webhook((BODY + " ").encode(), sign(BODY), SECRET)

    def test_accepts_old_timestamp_by_default(self, monkeypatch):
        monkeypatch.delenv("LUMA_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 86400
        assert verify_luma_webhook(BODY.encode(), sign(BODY, SECRET, old), SECRET)

    def test_rejects_old_timestamp_with_explicit_tolerance(self):
        old = int(time.time()) - 600
        assert not verify_luma_webhook(BODY.encode(), sign(BODY, SECRET, old), SECRET, 300)

    def test_rejects_old_timestamp_when_env_set(self, monkeypatch):
        monkeypatch.setenv("LUMA_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 600
        assert not verify_luma_webhook(BODY.encode(), sign(BODY, SECRET, old), SECRET)

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("LUMA_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 600
        assert verify_luma_webhook(BODY.encode(), sign(BODY, SECRET, old), SECRET)

    def test_rejects_malformed_headers(self):
        assert not verify_luma_webhook(BODY.encode(), "garbage", SECRET)
        assert not verify_luma_webhook(BODY.encode(), "t=abc,v1=00", SECRET)
        assert not verify_luma_webhook(BODY.encode(), f"t={int(time.time())}", SECRET)
        assert not verify_luma_webhook(BODY.encode(), None, SECRET)

    def test_accepts_when_any_v1_matches(self):
        assert verify_luma_webhook(BODY.encode(), f"{sign(BODY)},v1=deadbeef", SECRET)


class TestEndpoint:
    @pytest.mark.parametrize(
        "event_type",
        [
            "calendar.event.added",
            "calendar.event.submitted",
            "calendar.person.subscribed",
            "calendar.person.unsubscribed",
            "event.created",
            "event.updated",
            "event.canceled",
            "guest.registered",
            "guest.updated",
            "guest.refunded",
            "ticket.registered",
            "something.new",
        ],
    )
    def test_valid_event_returns_200(self, event_type):
        body = json.dumps(event(event_type, {"id": "x", "user_email": "a@example.com", "email": "a@example.com"}))
        assert post(body, sign(body)).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        assert post(BODY, sign(BODY), "text/plain").status_code == 200

    def test_invalid_signature_returns_400(self):
        assert post(BODY, sign(BODY, "whsec_wrong")).status_code == 400

    def test_missing_header_returns_400(self):
        assert post(BODY).status_code == 400

    def test_signed_invalid_json_returns_400(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
