import hashlib
import hmac
import base64
import json
import os
import time

# Kit secrets start with whsec_ but are used WHOLE as UTF-8 key bytes (no base64 decoding)
SECRET = "whsec_9f8a1c2d3e4f5a6b7c8d9e0f1a2b3c4d"
os.environ["KIT_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_kit_webhook  # noqa: E402

client = TestClient(app)

SUBSCRIBER = {
    "id": 987654,
    "first_name": "Ada",
    "email_address": "ada@example.com",
    "state": "active",
    "created_at": "2026-07-29T14:32:10Z",
    "fields": {},
}


def v1(body: str, secret: str | bytes, t: int) -> str:
    key = secret if isinstance(secret, bytes) else secret.encode()
    return hmac.new(key, f"{t}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, secret: str = SECRET, t: int | None = None) -> str:
    t = int(time.time()) if t is None else t
    return f"t={t},v1={v1(body, secret, t)}"


def event(event_type: str, data: dict | None = None) -> dict:
    return {
        "id": "9c2e1f3a-6b7d-4e8f-a1b2-c3d4e5f60718",
        "type": event_type,
        "created": "2026-07-29T14:32:10Z",
        "data": {"subscriber": SUBSCRIBER} if data is None else data,
    }


def delivery(*events: dict) -> str:
    return json.dumps({"delivery_id": 123456, "events": list(events)})


def post(body: str, header: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if header:
        headers["X-Kit-Signature"] = header
    return client.post("/webhooks/kit", content=body, headers=headers)


class TestVerify:
    body = delivery(event("subscriber.created"))

    def test_valid_signature(self):
        assert verify_kit_webhook(self.body.encode(), sign(self.body), SECRET)

    def test_whole_secret_not_stripped_or_decoded(self):
        stripped = SECRET[len("whsec_"):]
        t = int(time.time())
        assert not verify_kit_webhook(self.body.encode(), sign(self.body, stripped), SECRET)
        decoded = base64.b64decode(stripped + "=" * (-len(stripped) % 4))
        header = f"t={t},v1={v1(self.body, decoded, t)}"
        assert not verify_kit_webhook(self.body.encode(), header, SECRET)

    def test_wrong_secret(self):
        assert not verify_kit_webhook(self.body.encode(), sign(self.body, "whsec_other"), SECRET)

    def test_tampered_body(self):
        assert not verify_kit_webhook((self.body + " ").encode(), sign(self.body), SECRET)

    def test_tampered_timestamp(self):
        t = int(time.time())
        header = f"t={t + 1},v1={v1(self.body, SECRET, t)}"
        assert not verify_kit_webhook(self.body.encode(), header, SECRET)

    def test_old_timestamp_accepted_by_default(self, monkeypatch):
        # Hookdeck retries and replays keep the original t
        monkeypatch.delenv("KIT_TIMESTAMP_TOLERANCE_SECONDS", raising=False)
        old = int(time.time()) - 86400
        assert verify_kit_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_old_timestamp_rejected_with_explicit_tolerance(self):
        old = int(time.time()) - 600
        assert not verify_kit_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=300)

    def test_old_timestamp_rejected_when_window_set(self, monkeypatch):
        monkeypatch.setenv("KIT_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 600
        assert not verify_kit_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_non_numeric_window_treated_as_zero(self, monkeypatch):
        monkeypatch.setenv("KIT_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 600
        assert verify_kit_webhook(self.body.encode(), sign(self.body, t=old), SECRET)

    def test_stale_timestamp_with_wider_tolerance(self):
        old = int(time.time()) - 600
        assert verify_kit_webhook(self.body.encode(), sign(self.body, t=old), SECRET, tolerance=3600)

    def test_malformed_headers(self):
        for bad in ["garbage", "t=abc,v1=00", f"t={int(time.time())}", None, ""]:
            assert not verify_kit_webhook(self.body.encode(), bad, SECRET)

    def test_any_v1_signature_matches_during_rotation(self):
        t = int(time.time())
        previous = "whsec_previous_secret"
        header = f"t={t},v1={v1(self.body, SECRET, t)},v1={v1(self.body, previous, t)}"
        assert verify_kit_webhook(self.body.encode(), header, SECRET)
        assert verify_kit_webhook(self.body.encode(), header, previous)
        assert verify_kit_webhook(self.body.encode(), f"{sign(self.body)},v1=deadbeef", SECRET)

    def test_spaces_after_commas(self):
        t = int(time.time())
        assert verify_kit_webhook(self.body.encode(), f"t={t}, v1={v1(self.body, SECRET, t)}", SECRET)


class TestEndpoint:
    def test_valid_events(self):
        cases = [
            ("subscriber.created", {}),
            ("subscriber.activated", {}),
            ("subscriber.unsubscribed", {}),
            ("subscriber.bounced", {}),
            ("subscriber.complained", {}),
            ("subscriber.subscribed_to_form", {"form": {"id": 55, "name": "Newsletter signup"}}),
            ("subscriber.tag_added", {"tag": {"id": 42, "name": "customer"}}),
            ("subscriber.tag_removed", {"tag": {"id": 42, "name": "customer"}}),
            ("broadcast.sent", {}),
        ]
        for event_type, extra in cases:
            body = delivery(event(event_type, {"subscriber": SUBSCRIBER, **extra}))
            assert post(body, sign(body)).status_code == 200

    def test_batched_delivery(self):
        body = delivery(event("subscriber.created"), {**event("subscriber.created"), "id": "b1"})
        assert post(body, sign(body)).status_code == 200

    def test_any_content_type_verifies(self):
        body = delivery(event("subscriber.created"))
        assert post(body, sign(body), "application/vnd.kit+json").status_code == 200

    def test_invalid_signature(self):
        body = delivery(event("subscriber.created"))
        assert post(body, sign(body, "whsec_wrong")).status_code == 400

    def test_missing_header(self):
        assert post(delivery(event("subscriber.created"))).status_code == 400

    def test_signed_body_without_events(self):
        body = json.dumps({"type": "subscriber.created"})
        assert post(body, sign(body)).status_code == 400

    def test_signed_invalid_json(self):
        body = "not json"
        assert post(body, sign(body)).status_code == 400

    def test_health(self):
        assert client.get("/health").status_code == 200
