import hashlib
import hmac
import itertools
import json
import os

# Set test environment variables before importing the app.
# Terminal49's `secret` attribute is an opaque string, used as UTF-8 bytes as-is.
os.environ["TERMINAL49_WEBHOOK_SECRET"] = "test_terminal49_webhook_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, processed_notification_ids, verify_terminal49_signature

client = TestClient(app)

SECRET = os.environ["TERMINAL49_WEBHOOK_SECRET"]
HEADER = "X-T49-Webhook-Signature"

_counter = itertools.count(1)


def notification(event, reference_type="transport_event", included=None):
    """Shaped like Terminal49's documented webhook_notification payloads (trimmed `included`)."""
    n = next(_counter)
    return {
        "data": {
            "id": f"a3baf7bb-3ffe-485e-bf9d-{n:012d}",
            "type": "webhook_notification",
            "attributes": {
                "id": f"n-{n}",
                "event": event,
                "delivery_status": "succeeded",
                "created_at": "2022-10-21T20:16:47Z",
            },
            "relationships": {
                "reference_object": {"data": {"id": "58114b8d-7aab-491d-97ce-7b32c0c1d198", "type": reference_type}},
                "webhook": {"data": {"id": "7c353e67-cab6-422e-a17f-8483bf250dd9", "type": "webhook"}},
                "webhook_notification_logs": {"data": []},
            },
        },
        "included": included or [],
    }


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Terminal49: lowercase hex HMAC-SHA256 of the raw body, secret as-is."""
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def post(body: bytes, headers=None, content_type="application/json"):
    return client.post(
        "/webhooks/terminal49",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


def post_signed(payload):
    body = json.dumps(payload).encode()
    return post(body, {HEADER: sign(body)})


@pytest.fixture(autouse=True)
def reset_state():
    processed_notification_ids.clear()


class TestSignatureVerification:
    body = json.dumps(notification("tracking_request.succeeded", "tracking_request")).encode()

    def test_accepts_valid_signature(self):
        res = post(self.body, {HEADER: sign(self.body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex(self):
        assert post(self.body, {HEADER: sign(self.body).upper()}).status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        pretty = json.dumps(json.loads(self.body), indent=4).encode()
        res = post(pretty, {HEADER: sign(pretty)}, content_type="application/vnd.api+json")
        assert res.status_code == 200

    def test_rejects_missing_signature(self):
        assert post(self.body).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(self.body, {HEADER: ""}).status_code == 401

    def test_rejects_wrong_signature(self):
        assert post(self.body, {HEADER: sign(self.body, "another_secret")}).status_code == 401

    def test_rejects_tampered_body(self):
        tampered = self.body.replace(b"succeeded", b"failed")
        assert post(tampered, {HEADER: sign(self.body)}).status_code == 401

    @pytest.mark.parametrize(
        "signature",
        ["abcdef", "a" * 66, "z" * 64, "sha256=" + "a" * 64],
        ids=["too-short", "too-long", "non-hex", "prefixed"],
    )
    def test_rejects_malformed_signature(self, signature):
        assert post(self.body, {HEADER: signature}).status_code == 401

    def test_rejects_trailing_newline_digest(self):
        # re.fullmatch (not match/$) so "<64 hex>\n" is not accepted
        assert verify_terminal49_signature(self.body, sign(self.body) + "\n") is False

    def test_non_ascii_signature_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/terminal49",
            content=self.body,
            headers=[(b"content-type", b"application/json"), (b"x-t49-webhook-signature", "é".encode("latin-1") * 32)],
        )
        assert res.status_code == 401

    def test_fails_closed_when_no_secret_is_configured(self):
        assert verify_terminal49_signature(self.body, sign(self.body), "") is False
        assert verify_terminal49_signature(self.body, sign(self.body), SECRET) is True


class TestEventHandling:
    @pytest.mark.parametrize(
        "event,reference_type",
        [
            ("tracking_request.succeeded", "tracking_request"),
            ("tracking_request.failed", "tracking_request"),
            ("container.transport.vessel_arrived", "transport_event"),
            ("container.transport.vessel_departed", "transport_event"),
            ("container.transport.available", "transport_event"),
            ("container.updated", "container_updated_event"),
            ("shipment.estimated.arrival", "estimated_event"),
        ],
    )
    def test_handles_event(self, event, reference_type):
        assert post_signed(notification(event, reference_type)).status_code == 200

    def test_accepts_unhandled_events(self, capsys):
        res = post_signed(notification("container.transport.rail_loaded"))
        assert res.status_code == 200
        assert "Unhandled event: container.transport.rail_loaded" in capsys.readouterr().out

    def test_skips_duplicate_delivery(self, capsys):
        payload = notification("container.updated", "container_updated_event")
        assert post_signed(payload).status_code == 200
        assert post_signed(payload).status_code == 200
        assert f"Duplicate notification {payload['data']['id']}, skipping" in capsys.readouterr().out

    def test_signed_non_json_body_is_400(self):
        body = b"not json"
        assert post(body, {HEADER: sign(body)}).status_code == 400

    def test_missing_event_is_400(self):
        assert post_signed({"data": {"id": "x", "type": "webhook_notification", "attributes": {}}}).status_code == 400
