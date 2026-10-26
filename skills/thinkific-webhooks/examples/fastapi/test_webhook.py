import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
os.environ["THINKIFIC_WEBHOOK_SECRET"] = "test_thinkific_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_thinkific_signature

client = TestClient(app)

SECRET = os.environ["THINKIFIC_WEBHOOK_SECRET"]
HEADER = "X-Thinkific-Hmac-Sha256"


def sign(body, secret=SECRET):
    """What Thinkific sends: lowercase hex HMAC-SHA256 of the raw body, no prefix."""
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


# Based on the documented order.created sample
ORDER_CREATED = {
    "id": "20180126172320940835610",
    "resource": "order",
    "action": "created",
    "tenant_id": "3",
    "created_at": "2018-01-26T22:23:20.808Z",
    "payload": {
        "id": 19796,
        "order_number": 1010,
        "amount_cents": 5000,
        "product_name": "Introduction to Webhooks",
        "user": {"id": 123456, "email": "ninjas@thinkific.com"},
    },
}

# Based on the documented enrollment.completed sample
ENROLLMENT_COMPLETED = {
    "id": "01JTVB3ZXNK1M928X2MMZ5CJ2X",
    "resource": "enrollment",
    "action": "completed",
    "tenant_id": "445230",
    "created_at": "2025-05-09T20:17:20.000Z",
    "timestamp": 1746821840,
    "payload": {"id": 652268044, "user": {"id": 222244858}, "course": {"id": 3093805, "name": "Introduction to Webhooks"}},
}


def post(body, headers=None, content_type="application/json"):
    if isinstance(body, str):
        body = body.encode("utf-8")
    return client.post(
        "/webhooks/thinkific",
        content=body,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        body = json.dumps(ORDER_CREATED)
        res = post(body, {HEADER: sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        body = json.dumps(ORDER_CREATED)
        assert post(body, {HEADER: sign(body).upper()}).status_code == 200

    def test_verifies_exact_raw_bytes_not_reserialised_json(self):
        # Odd spacing and a non-ASCII name: json.dumps(json.loads(body)) would differ
        body = '{ "id": "1",  "resource": "user", "action": "signup",\n  "payload": { "id": 7, "first_name": "Zoë" } }'
        assert post(body, {HEADER: sign(body)}).status_code == 200

    def test_accepts_any_content_type(self):
        body = json.dumps(ORDER_CREATED)
        assert post(body, {HEADER: sign(body)}, "text/plain").status_code == 200

    def test_rejects_missing_signature(self):
        assert post(json.dumps(ORDER_CREATED)).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(json.dumps(ORDER_CREATED), {HEADER: ""}).status_code == 401

    def test_rejects_signature_for_different_body(self):
        res = post(json.dumps(ORDER_CREATED), {HEADER: sign(json.dumps(ENROLLMENT_COMPLETED))})
        assert res.status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(ORDER_CREATED)
        assert post(body, {HEADER: sign(body, "another-secret-0123456789")}).status_code == 401

    @pytest.mark.parametrize(
        "make_bad",
        [
            lambda good: good[:62],
            lambda good: good + "00",
            lambda good: "z" * 64,
            lambda good: "sha256=" + good,
        ],
    )
    def test_rejects_malformed_signature(self, make_bad):
        body = json.dumps(ORDER_CREATED)
        assert post(body, {HEADER: make_bad(sign(body))}).status_code == 401

    def test_rejects_modified_body(self):
        body = json.dumps(ORDER_CREATED)
        assert post(body.replace("5000", "1"), {HEADER: sign(body)}).status_code == 401


class TestFixedVector:
    BODY = (
        '{"id":"20180126172320940835610","resource":"order","action":"created","tenant_id":"3",'
        '"created_at":"2018-01-26T22:23:20.808Z","payload":{"id":19796,"order_number":1010,'
        '"billing_name":"Zoë Smith","amount_cents":5000,"product_name":"Introduction to Webhooks"}}'
    )
    DIGEST = "37203a0607cb973af0fef64b8eabb95b761b537e592b7a86d3293a285978e6c6"

    def test_matches_fixed_digest(self):
        assert verify_thinkific_signature(self.BODY.encode("utf-8"), self.DIGEST, SECRET) is True

    def test_fails_closed_without_secret(self):
        assert verify_thinkific_signature(self.BODY.encode("utf-8"), self.DIGEST, "") is False

    def test_non_ascii_header_is_a_clean_reject(self):
        assert verify_thinkific_signature(b"{}", "é" * 64, SECRET) is False


class TestEventHandling:
    @pytest.mark.parametrize(
        "event",
        [
            ORDER_CREATED,
            ENROLLMENT_COMPLETED,
            {"id": "2", "resource": "user", "action": "signup", "payload": {"id": 1}},
            {"id": "3", "resource": "course", "action": "updated", "payload": {"id": 2}},
            {"id": "4", "resource": "order_transaction", "action": "refunded", "payload": {"id": 3}},
            {"id": "5", "resource": "lesson", "action": "completed", "payload": {"id": 4}},
            {"name": "cart.abandoned", "version": 1, "data": {"id": "c1"}},
        ],
    )
    def test_acknowledges_events(self, event):
        body = json.dumps(event)
        assert post(body, {HEADER: sign(body)}).status_code == 200

    def test_400_for_signed_non_json(self):
        body = "not json"
        assert post(body, {HEADER: sign(body)}, "text/plain").status_code == 400

    def test_400_for_signed_json_array(self):
        body = "[1,2]"
        assert post(body, {HEADER: sign(body)}).status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
