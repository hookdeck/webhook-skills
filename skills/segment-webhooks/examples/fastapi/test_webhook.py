import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Segment shared secrets are any string you choose in Destination Settings
os.environ["SEGMENT_SHARED_SECRET"] = "test_segment_shared_secret"

from main import app, first_batch_item, verify_segment_signature  # noqa: E402

client = TestClient(app)
SECRET = os.environ["SEGMENT_SHARED_SECRET"]


def sign(content: str, secret: str = SECRET) -> str:
    """Sign like Segment: hex(HMAC-SHA1(secret, content))."""
    return hmac.new(secret.encode("utf-8"), content.encode("utf-8"), hashlib.sha1).hexdigest()


def js_stringify(value) -> str:
    """Approximate JSON.stringify output (compact, non-ASCII left as-is)."""
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


TRACK = {
    "type": "track",
    "messageId": "msg-track-1",
    "userId": "019mr8mf4r",
    "event": "Purchased an Item",
    "properties": {"revenue": "39.95", "shippingMethod": "2-day"},
    "timestamp": "2012-12-02T00:30:08.276Z",
}

IDENTIFY = {
    "type": "identify",
    "messageId": "msg-identify-1",
    "userId": "019mr8mf4r",
    "traits": {"email": "achilles@segment.com", "name": "Achilles", "name_ja": "アキレス"},
    "timestamp": "2012-12-02T00:30:08.276Z",
}


def post(body: str, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Signature"] = signature
    return client.post("/webhooks/segment", content=body.encode("utf-8"), headers=headers)


class TestVerifySegmentSignature:
    def test_valid_signature(self):
        body = js_stringify(TRACK)
        assert verify_segment_signature(body.encode(), sign(body), SECRET) is True

    def test_digest_is_40_char_hex(self):
        assert len(sign("{}")) == 40

    def test_rejects_sha256(self):
        body = js_stringify(TRACK)
        sha256 = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        assert verify_segment_signature(body.encode(), sha256, SECRET) is False

    def test_rejects_tampered_body(self):
        body = js_stringify(TRACK)
        tampered = body.replace("39.95", "0.01")
        assert verify_segment_signature(tampered.encode(), sign(body), SECRET) is False

    def test_rejects_wrong_secret(self):
        body = js_stringify(TRACK)
        assert verify_segment_signature(body.encode(), sign(body, "wrong"), SECRET) is False

    def test_rejects_missing_signature_or_secret(self):
        body = js_stringify(TRACK).encode()
        assert verify_segment_signature(body, None, SECRET) is False
        assert verify_segment_signature(body, "abc", None) is False

    def test_batch_signed_over_first_event(self):
        batch = [IDENTIFY, TRACK]
        body = js_stringify(batch)
        assert verify_segment_signature(body.encode(), sign(js_stringify(batch[0])), SECRET) is True

    def test_batch_with_signature_of_other_event(self):
        body = js_stringify([TRACK, IDENTIFY])
        assert verify_segment_signature(body.encode(), sign(js_stringify(IDENTIFY)), SECRET) is False

    def test_raw_body_hmac_differs_for_batch(self):
        """Documents the caveat: a raw-body HMAC never matches a Segment batch signature."""
        batch = [TRACK, IDENTIFY]
        assert sign(js_stringify(batch)) != sign(js_stringify(batch[0]))

    def test_invalid_json_returns_false(self):
        assert verify_segment_signature(b"[not json", "a" * 40, SECRET) is False


class TestFirstBatchItem:
    def test_slices_exact_bytes(self):
        # Number formatting that json.dumps would change (1e21, 1.0)
        raw = b'[{"n":1e21,"f":1.0,"s":"caf\\u00e9"},{"x":2}]'
        assert first_batch_item(raw) == b'{"n":1e21,"f":1.0,"s":"caf\\u00e9"}'

    def test_non_array_returns_none(self):
        assert first_batch_item(b'{"type":"track"}') is None

    def test_empty_array_returns_none(self):
        assert first_batch_item(b"[]") is None


class TestSegmentWebhook:
    def test_missing_signature_returns_400(self):
        response = post(js_stringify(TRACK))
        assert response.status_code == 400
        assert response.json()["detail"] == "Missing X-Signature header"

    def test_invalid_signature_returns_400(self):
        response = post(js_stringify(TRACK), "a" * 40)
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    @pytest.mark.parametrize(
        "event",
        [
            TRACK,
            IDENTIFY,
            {"type": "page", "userId": "u1", "properties": {"path": "/pricing"}},
            {"type": "screen", "userId": "u1", "name": "Main Screen"},
            {"type": "group", "userId": "u1", "groupId": "g1", "traits": {"name": "Initech"}},
            {"type": "alias", "previousId": "anon-1", "userId": "u1"},
            {"type": "delete", "userId": "u1"},
        ],
        ids=lambda e: e["type"],
    )
    def test_signed_call_returns_200(self, event):
        body = js_stringify(event)
        response = post(body, sign(body))
        assert response.status_code == 200
        assert response.json() == {"received": True, "count": 1}

    def test_signed_batch_returns_200(self):
        batch = [IDENTIFY, TRACK, {"type": "page", "name": "Home"}]
        response = post(js_stringify(batch), sign(js_stringify(batch[0])))
        assert response.status_code == 200
        assert response.json() == {"received": True, "count": 3}

    def test_batch_with_altered_first_event_returns_400(self):
        signature = sign(js_stringify(TRACK))
        tampered = [{**TRACK, "event": "Refunded"}, IDENTIFY]
        response = post(js_stringify(tampered), signature)
        assert response.status_code == 400

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("SEGMENT_SHARED_SECRET")
        body = js_stringify(TRACK)
        response = post(body, sign(body))
        assert response.status_code == 500


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
