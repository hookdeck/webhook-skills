import base64
import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516"
os.environ["BELVO_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, classify, verify_belvo_request

client = TestClient(app)

# Shapes taken from Belvo's documented sample payloads (trimmed)
PAYMENT_SUCCESS = {
    "eventType": "payment_request_update",
    "eventCode": "payment_request_successful",
    "datetime": "2022-01-01T12:34:56.789Z",
    "details": {
        "id": "3118128a-6792-4b06-bd61-4acf6f6ad6b5",
        "reference": "your_reference_here",
        "status": "successful",
        "amount": 100.5,
        "failedReason": None,
        "failedMessage": None,
    },
}
PAYMENT_FAILED = {
    "eventType": "payment_request_update",
    "eventCode": "payment_request_failed",
    "datetime": "2022-01-01T12:34:56.789Z",
    "details": {"id": "3118128a-6792-4b06-bd61-4acf6f6ad6b5", "status": "failed", "amount": 100.5, "failedReason": "insufficient_funds"},
}
CONSENT_CONFIRMED = {
    "eventType": "consent_update",
    "eventCode": "consent_confirmed",
    "datetime": "2025-10-30T12:34:56.789Z",
    "details": {"id": "4fa8f2b1-3c7d-4e9a-b5c6-111111111101", "paymentMethodId": "4fa8f2b1-3c7d-4e9a-b5c6-111111111102", "status": "confirmed"},
}
CUSTOMER_BLOCKED = {
    "eventType": "customer_update",
    "eventCode": "customer_blocked",
    "datetime": "2025-10-30T12:34:56.789Z",
    "details": {"id": "c1", "documentNumber": "XAXX010101000"},
}
AGGREGATION = {
    "webhook_id": "aadf41a1fc8e4f79a49f7f04027ac999",
    "webhook_type": "ACCOUNTS",
    "webhook_code": "new_accounts_available",
    "link_id": "16f68516-bcbc-4cf7-b815-c500d4204e28",
    "request_id": "4363b08b-51eb-4350-9c74-5df5ac92a7f6",
    "external_id": "your_external_id",
    "data": {},
}
BRAZIL_V1 = {
    "webhook_id": "3b9a69f7-0f0a-455b-832d-49ad6fd4905c",
    "webhook_type": "PAYMENT_INTENTS",
    "webhook_code": "STATUS_UPDATE",
    "object_id": "d2e40773-19f6-48d1-93c3-3590ec0c74df",
    "external_id": "c3c51aaf-aaa3-400c-926d-87ab62e195fd",
    "data": {"status": "FAILED", "failure_code": "consent_expired",
             "failure_message": "The payment consent was not accepted in time."},
}
BRAZIL_V2 = {
    "schema_version": "2.0.0",
    "resource": "BANK_ACCOUNT",
    "resource_id": "7d01c4cf-57ed-4ed9-b109-a5bfb2d8c42b",
    "resource_version": "V2",
    "timestamp": "2025-01-16T10:30:45Z",
}
AGGREGATION_ERROR = {
    **AGGREGATION,
    "webhook_type": "TRANSACTIONS",
    "webhook_code": "historical_update",
    "data": {"errors": [{"code": "operational_limits_reached", "message": "Operational Limit Reached"}]},
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(PAYMENT_SUCCESS)
    return client.post(
        "/webhooks/belvo",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBelvoWebhook:
    def test_accepts_full_authorization_header_bearer(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_basic_when_configured(self, monkeypatch):
        basic = "Basic " + base64.b64encode(b"belvo:s3cret").decode()
        monkeypatch.setenv("BELVO_AUTHORIZATION", basic)
        assert post(json.dumps(AGGREGATION), {"Authorization": basic}).status_code == 200
        assert post(json.dumps(AGGREGATION), {"Authorization": AUTH}).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_token(self):
        res = post(headers={"Authorization": "Bearer 00000000-0000-0000-0000-000000000000"})
        assert res.status_code == 401

    def test_rejects_token_without_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Bearer ", "")}).status_code == 401

    def test_rejects_different_scheme_same_token(self):
        assert post(headers={"Authorization": AUTH.replace("Bearer", "Basic")}).status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(PAYMENT_FAILED), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400

    def test_accepts_payments_mexico_brazil_and_aggregation_payloads(self):
        for body in (PAYMENT_FAILED, CONSENT_CONFIRMED, CUSTOMER_BLOCKED, AGGREGATION, AGGREGATION_ERROR, BRAZIL_V1, BRAZIL_V2):
            assert post(json.dumps(body), {"Authorization": AUTH}).status_code == 200

    def test_acknowledges_unknown_payloads(self):
        assert post('{"foo": 1}', {"Authorization": AUTH}).status_code == 200


class TestHelpers:
    def test_classify(self):
        assert classify(PAYMENT_SUCCESS) == {"family": "payments_mx", "code": "payment_request_successful"}
        assert classify(BRAZIL_V1) == {"family": "payments_br_v1", "code": "STATUS_UPDATE", "type": "PAYMENT_INTENTS"}
        assert classify(BRAZIL_V2) == {
            "family": "payments_br_v2", "code": "BANK_ACCOUNT", "id": "7d01c4cf-57ed-4ed9-b109-a5bfb2d8c42b"}
        assert classify(AGGREGATION) == {"family": "aggregation", "code": "new_accounts_available", "type": "ACCOUNTS"}
        assert classify({"foo": 1}) is None

    def test_never_accepts_when_unconfigured(self):
        assert verify_belvo_request({"authorization": "Bearer x"}, {}) is False
        assert verify_belvo_request({"authorization": ""}, {"BELVO_AUTHORIZATION": ""}) is False

    def test_non_ascii_header_does_not_raise(self):
        assert verify_belvo_request({"authorization": "Bearer café"}, {"BELVO_AUTHORIZATION": AUTH}) is False
        assert verify_belvo_request({"authorization": "Bearer café"}, {"BELVO_AUTHORIZATION": "Bearer café"}) is True
