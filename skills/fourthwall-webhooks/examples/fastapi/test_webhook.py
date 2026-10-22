import base64
import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Fourthwall shop secret keys are UUID-like strings, used as UTF-8 text
SECRET = "e3f93c7c-c92b-4b8f-a9b1-5b70e0891abc"
os.environ["FOURTHWALL_WEBHOOK_SECRET"] = SECRET

from main import app, verify_fourthwall_signature  # noqa: E402

client = TestClient(app)


def sign(payload: str | bytes, secret: str = SECRET) -> str:
    """Generate a valid Fourthwall signature: base64(HMAC-SHA256(secret, raw body))."""
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    return base64.b64encode(hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).digest()).decode("utf-8")


def make_event(event_type: str, data: dict | None = None) -> str:
    return json.dumps({
        "testMode": False,
        "id": "weve_geAva6c1RAuyb9HQxbSlmA",
        "webhookId": "wcon_P-VkRfmJTBaC6_Tst22cew",
        "shopId": "sh_7ad0c438-beda-4779-a885-0dc325a755c1",
        "type": event_type,
        "apiVersion": "V1_BETA",
        "createdAt": "2023-07-12T15:05:11.078089+00:00",
        "data": data or {},
    })


def post(payload: str, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Fourthwall-Hmac-SHA256"] = signature
    return client.post("/webhooks/fourthwall", content=payload, headers=headers)


class TestVerifyFourthwallSignature:
    payload = b'{"id":"weve_1"}'

    def test_valid_signature_returns_true(self):
        assert verify_fourthwall_signature(self.payload, sign(self.payload), SECRET) is True

    def test_signature_from_other_secret_returns_false(self):
        assert verify_fourthwall_signature(self.payload, sign(self.payload, "other-secret"), SECRET) is False

    def test_tampered_body_returns_false(self):
        assert verify_fourthwall_signature(b'{"id":"weve_2"}', sign(self.payload), SECRET) is False

    def test_missing_signature_returns_false(self):
        assert verify_fourthwall_signature(self.payload, None, SECRET) is False

    def test_hex_digest_returns_false(self):
        hex_digest = hmac.new(SECRET.encode(), self.payload, hashlib.sha256).hexdigest()
        assert verify_fourthwall_signature(self.payload, hex_digest, SECRET) is False


class TestFourthwallWebhook:
    def test_missing_signature_returns_400(self):
        response = post(make_event("ORDER_PLACED"))
        assert response.status_code == 400

    def test_invalid_signature_returns_400(self):
        response = post(make_event("ORDER_PLACED"), "invalid_signature")
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = make_event("ORDER_PLACED", {"friendlyId": "D3XZY7DR"})
        response = post(payload, sign(payload))

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_any_content_type_verifies(self):
        payload = make_event("DONATION", {"username": "supporter"})
        response = post(payload, sign(payload), content_type="text/plain")

        assert response.status_code == 200

    def test_exact_bytes_are_verified(self):
        payload = '{ "id": "weve_1",   "type": "DONATION", "data": {} }'
        response = post(payload, sign(payload))

        assert response.status_code == 200

    def test_signed_non_json_returns_400(self):
        response = post("not json", sign("not json"))
        assert response.status_code == 400

    def test_known_event_types_return_200(self):
        types = [
            "ORDER_PLACED",
            "ORDER_UPDATED",
            "GIFT_PURCHASE",
            "DONATION",
            "SUBSCRIPTION_PURCHASED",
            "SUBSCRIPTION_CHANGED",
            "SUBSCRIPTION_EXPIRED",
            "PRODUCT_CREATED",
            "PRODUCT_UPDATED",
            "NEWSLETTER_SUBSCRIBED",  # not handled explicitly: still acknowledged
        ]
        for event_type in types:
            payload = make_event(event_type, {"id": "x"})
            assert post(payload, sign(payload)).status_code == 200


class TestHealth:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
