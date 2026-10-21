import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

# Motive secrets are 20-character strings, used as-is (no base64 decoding)
os.environ["MOTIVE_WEBHOOK_SECRET"] = "a1b2c3d4e5f6a7b8c9d0"

from main import app, verify_motive_signature  # noqa: E402

client = TestClient(app)
SECRET = os.environ["MOTIVE_WEBHOOK_SECRET"]


def sign(body: str, secret: str = SECRET) -> str:
    """Sign like Motive: hex(HMAC-SHA1(secret, rawBody))."""
    return hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha1).hexdigest()


def post(body: str, signature: str = None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-KT-Webhook-Signature"] = signature
    return client.post("/webhooks/motive", content=body, headers=headers)


FAULT_OPENED = {
    "action": "fault_code_opened",
    "trigger": "created",
    "id": 123,
    "code_label": "SPN-5610",
    "status": "open",
    "vehicle": {"id": 1, "number": "T123", "vin": "ABC12345678909876"},
}

LOCATION_UPDATED = {
    "action": "vehicle_location_updated",
    "trigger": "updated",
    "id": "5d3d5cf6-501f-4566-ad07-a80c05c743a7",
    "vehicle_id": 123,
    "vehicle_number": "sample",
    "lat": 34.123,
    "lon": -84.123,
}


class TestVerifyMotiveSignature:
    def test_matches_docs_test_vector(self):
        secret = "d9d36bea41c44ae49d1bfc4a48ba2abe"
        body = '["fault_code_closed"]'
        expected = "f04a8386a21a6cba0447024e83b3f0983352bb72"
        assert sign(body, secret) == expected
        assert verify_motive_signature(body.encode(), expected, secret)

    def test_signature_as_key_does_not_match(self):
        """The docs' bash/Ruby samples key with the signature; that is wrong."""
        body = '["fault_code_closed"]'
        wrong = sign(body, "f04a8386a21a6cba0447024e83b3f0983352bb72")
        assert not verify_motive_signature(
            body.encode(), wrong, "d9d36bea41c44ae49d1bfc4a48ba2abe"
        )

    def test_accepts_uppercase_hex(self):
        body = json.dumps(FAULT_OPENED)
        assert verify_motive_signature(body.encode(), sign(body).upper(), SECRET)

    def test_rejects_tampered_body(self):
        body = json.dumps(FAULT_OPENED)
        assert not verify_motive_signature((body + " ").encode(), sign(body), SECRET)

    def test_rejects_sha256_signature(self):
        body = json.dumps(FAULT_OPENED)
        sha256 = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        assert not verify_motive_signature(body.encode(), sha256, SECRET)

    def test_rejects_missing_values_and_wrong_length(self):
        body = json.dumps(FAULT_OPENED).encode()
        assert not verify_motive_signature(body, None, SECRET)
        assert not verify_motive_signature(body, sign(body.decode()), None)
        assert not verify_motive_signature(body, "abc", SECRET)


class TestMotiveWebhook:
    def test_valid_fault_code_opened(self):
        body = json.dumps(FAULT_OPENED)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_valid_vehicle_location_updated(self):
        body = json.dumps(LOCATION_UPDATED)
        assert post(body, sign(body)).status_code == 200

    def test_unknown_action(self):
        body = json.dumps({"action": "something_new", "id": 1})
        assert post(body, sign(body)).status_code == 200

    def test_activation_test_body_is_not_json(self):
        body = "[vehicle_location_updated]"
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True, "ignored": True}

    def test_invalid_signature(self):
        body = json.dumps(FAULT_OPENED)
        assert post(body, "f" * 40).status_code == 403

    def test_missing_signature(self):
        body = json.dumps(FAULT_OPENED)
        assert post(body).status_code == 403

    def test_wrong_secret(self):
        body = json.dumps(FAULT_OPENED)
        assert post(body, sign(body, "ffffffffffffffffffff")).status_code == 403

    def test_verifies_raw_body_not_reserialized_json(self):
        body = '{ "action":  "fault_code_closed",\n  "id": 7 }'
        assert post(body, sign(body)).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
