import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# SpherePay endpoint secrets look like whsec_...; the whole string is the HMAC key
SECRET = "whsec_test_secret_for_unit_tests_0123456789"
os.environ["SPHEREPAY_WEBHOOK_SECRET"] = SECRET

from main import app, compute_signature, verify_spherepay  # noqa: E402

client = TestClient(app)

# Published vector from SpherePay's docs (verified against Hookdeck's SPHEREPAY source template)
VECTOR = {
    "secret": "whsec_9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c",
    "body": '{"id":"event_01HXPA3M9R7DEF456","type":"transfer.succeeded","apiVersion":"v2","originalCreateDate":"2026-08-07T14:05:30.000Z","livemode":true,"sequence":5,"data":{"id":"payout_d243ab2b1de4447d8a046d87fefe58cf","type":"transfer","applicationId":"application_1324354657","customerId":"customer_f31121c389624d3697cbf3ea8830b7a4","transferType":"oneTimeTransfer","previousStatus":"processing","previousStatusAt":"2026-08-07T14:02:15.000Z","status":"succeeded","statusAt":"2026-08-07T14:05:30.000Z"}}',
    "headers": {
        "sphere-timestamp": "1786111531",
        "sphere-signature": "4f04e86648d8f1341d431b4cfa00eaeb7c69b7b3fcee7dff97b24f95482a6be2",
    },
}

# Payloads as shown in SpherePay's event catalog
CUSTOMER_APPROVED = json.dumps(
    {
        "id": "event_01HXP9ZK7Q4ABC123",
        "type": "customer.approved",
        "apiVersion": "v2",
        "originalCreateDate": "2026-08-07T14:00:00.123456Z",
        "livemode": True,
        "sequence": 3,
        "data": {
            "id": "customer_f31121c389624d3697cbf3ea8830b7a4",
            "type": "customer",
            "applicationId": "application_1324354657",
            "verificationProfile": "kyc_profile_a",
            "previousStatus": "pending",
            "previousStatusAt": "2026-08-06T10:15:30.000Z",
            "status": "approved",
            "statusAt": "2026-08-07T14:00:00.000Z",
        },
    }
)
TRANSFER_SUCCEEDED = VECTOR["body"]


def now() -> str:
    return str(int(time.time()))


def sign(body, timestamp=None, secret=SECRET) -> dict:
    ts = now() if timestamp is None else timestamp
    raw = body if isinstance(body, bytes) else body.encode()
    sig = hmac.new(secret.encode(), ts.encode() + b"." + raw, hashlib.sha256).hexdigest()
    return {"Sphere-Timestamp": ts, "Sphere-Signature": sig}


def post(body, headers, content_type="application/json"):
    return client.post(
        "/webhooks/spherepay",
        content=body,
        headers={"Content-Type": content_type, **headers},
    )


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SPHEREPAY_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestPublishedVector:
    def test_computes_the_documented_signature(self):
        sig = compute_signature(
            VECTOR["body"].encode(), VECTOR["headers"]["sphere-timestamp"], VECTOR["secret"]
        )
        assert sig == "4f04e86648d8f1341d431b4cfa00eaeb7c69b7b3fcee7dff97b24f95482a6be2"

    def test_verifier_accepts_vector_headers_and_secret(self):
        # No timestamp window by default: the vector's timestamp is long past
        assert verify_spherepay(VECTOR["body"].encode(), VECTOR["headers"], VECTOR["secret"]) is True

    def test_rejects_vector_under_wrong_secret(self):
        assert verify_spherepay(VECTOR["body"].encode(), VECTOR["headers"], SECRET) is False

    def test_rejects_vector_when_secret_lacks_whsec_prefix(self):
        bare = VECTOR["secret"][len("whsec_"):]
        assert verify_spherepay(VECTOR["body"].encode(), VECTOR["headers"], bare) is False


class TestWebhookHandler:
    def test_accepts_customer_approved(self):
        res = post(CUSTOMER_APPROVED, sign(CUSTOMER_APPROVED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_transfer_succeeded(self):
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED)).status_code == 200

    def test_accepts_published_vector_over_http(self, monkeypatch):
        monkeypatch.setenv("SPHEREPAY_WEBHOOK_SECRET", VECTOR["secret"])
        assert post(VECTOR["body"], VECTOR["headers"]).status_code == 200

    def test_accepts_any_content_type(self):
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED), "text/plain").status_code == 200

    def test_accepts_uppercase_hex_signature(self):
        headers = sign(TRANSFER_SUCCEEDED)
        headers["Sphere-Signature"] = headers["Sphere-Signature"].upper()
        assert post(TRANSFER_SUCCEEDED, headers).status_code == 200

    def test_verifies_exact_bytes_not_reserialised_body(self):
        pretty = json.dumps(json.loads(TRANSFER_SUCCEEDED), indent=2)
        assert post(pretty, sign(pretty)).status_code == 200
        # Signature over the compact form does not cover the pretty-printed body
        assert post(pretty, sign(TRANSFER_SUCCEEDED)).status_code == 401

    def test_verifies_raw_bytes_before_decoding(self):
        # Non-UTF-8 body: verification passes on the bytes, then JSON parsing fails
        body = bytes([0x7B, 0xFF, 0xFE, 0x7D])
        assert post(body, sign(body), "application/octet-stream").status_code == 400

    def test_unhandled_event_returns_200(self):
        body = json.dumps({"id": "event_1", "type": "transfer.expired", "sequence": 1, "data": {"id": "payout_1"}})
        assert post(body, sign(body)).status_code == 200

    def test_signed_non_json_body_returns_400(self):
        assert post("not json", sign("not json")).status_code == 400

    def test_signed_json_non_object_returns_400(self):
        assert post("[1, 2]", sign("[1, 2]")).status_code == 400

    def test_rejects_tampered_body(self):
        res = post(TRANSFER_SUCCEEDED.replace("succeeded", "failed"), sign(TRANSFER_SUCCEEDED))
        assert res.status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED, secret="whsec_other")).status_code == 401

    def test_rejects_signature_over_different_timestamp(self):
        headers = sign(TRANSFER_SUCCEEDED)
        headers["Sphere-Timestamp"] = str(int(headers["Sphere-Timestamp"]) + 1)
        assert post(TRANSFER_SUCCEEDED, headers).status_code == 401

    def test_rejects_missing_signature(self):
        headers = sign(TRANSFER_SUCCEEDED)
        del headers["Sphere-Signature"]
        assert post(TRANSFER_SUCCEEDED, headers).status_code == 401

    def test_rejects_missing_timestamp(self):
        headers = sign(TRANSFER_SUCCEEDED)
        del headers["Sphere-Timestamp"]
        assert post(TRANSFER_SUCCEEDED, headers).status_code == 401

    def test_rejects_empty_signature(self):
        headers = sign(TRANSFER_SUCCEEDED)
        headers["Sphere-Signature"] = ""
        assert post(TRANSFER_SUCCEEDED, headers).status_code == 401

    @pytest.mark.parametrize(
        "value",
        [
            "abcd",
            "a" * 66,
            "z" * 64,
            "sha256=" + "a" * 64,
            "a" * 64 + "," + "b" * 64,
            "a" * 64 + "\n",
        ],
        ids=["too-short", "too-long", "non-hex", "prefixed", "list", "trailing-newline"],
    )
    def test_rejects_malformed_signature(self, value):
        headers = sign(TRANSFER_SUCCEEDED)
        headers["Sphere-Signature"] = value
        # httpx rejects a newline inside a header value, so check the verifier directly for that case
        if "\n" in value:
            assert verify_spherepay(
                TRANSFER_SUCCEEDED.encode(),
                {"sphere-timestamp": headers["Sphere-Timestamp"], "sphere-signature": value},
                SECRET,
            ) is False
        else:
            assert post(TRANSFER_SUCCEEDED, headers).status_code == 401

    def test_returns_500_without_configured_secret(self, monkeypatch):
        monkeypatch.delenv("SPHEREPAY_WEBHOOK_SECRET")
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED)).status_code == 500


class TestOptionalTimestampTolerance:
    @staticmethod
    def old():
        return str(int(time.time()) - 3600)

    def test_old_timestamp_accepted_by_default(self):
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED, self.old())).status_code == 200

    def test_zero_means_off(self, monkeypatch):
        monkeypatch.setenv("SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED, self.old())).status_code == 200

    def test_old_timestamp_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED, self.old())).status_code == 401

    def test_fresh_timestamp_accepted_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED)).status_code == 200

    def test_non_numeric_timestamp_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED, "yesterday")).status_code == 401

    def test_invalid_tolerance_value_leaves_check_off(self, monkeypatch):
        monkeypatch.setenv("SPHEREPAY_WEBHOOK_TOLERANCE_SECONDS", "five minutes")
        assert post(TRANSFER_SUCCEEDED, sign(TRANSFER_SUCCEEDED, self.old())).status_code == 200
