import json
import os

# Set test environment variables before importing the app
os.environ["XENDIT_CALLBACK_TOKEN"] = "test_xendit_verification_token_0123456789"

from fastapi.testclient import TestClient

from main import app, verify_xendit_token

client = TestClient(app)

TOKEN = os.environ["XENDIT_CALLBACK_TOKEN"]

PAYMENT_EVENTS = [
    "payment.capture",
    "payment.authorization",
    "payment.failure",
    "payment.expiry",
    "payment_request.expiry",
    "payment_token.activation",
    "payment_token.failure",
    "payment_token.expiry",
    "refund.succeeded",
    "refund.failed",
]


def payment_payload(event="payment.capture"):
    """Payments API webhook (has an "event" field; resource is under "data")."""
    return {
        "event": event,
        "business_id": "603f1c4172bbe840979fd408",
        "created": "2026-08-26T07:28:23.731Z",
        "data": {
            "payment_id": "py-66269236-7447-450f-b0d8-ed4255b11d8a",
            "payment_request_id": "pr-c5a38204-58a9-4968-a8ad-68a79b172a66",
            "payment_token_id": "pt-1",
            "id": "rfd-1",
            "reference_id": "order-123",
            "currency": "IDR",
            "request_amount": 1234,
            "status": "SUCCEEDED",
        },
    }


def invoice_payload(status="PAID"):
    """Invoice callback (no "event" field)."""
    return {"id": "inv-1", "external_id": "order-123", "status": status, "amount": 50000, "currency": "IDR"}


def post(body=None, headers=None, content_type="application/json"):
    if body is None:
        body = json.dumps(payment_payload())
    all_headers = {"content-type": content_type, **(headers or {})}
    return client.post("/webhooks/xendit", content=body, headers=all_headers)


class TestTokenVerification:
    def test_accepts_correct_token(self):
        res = post(headers={"x-callback-token": TOKEN})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_wrong_token_of_same_length(self):
        res = post(headers={"x-callback-token": "x" * len(TOKEN)})
        assert res.status_code == 401

    def test_rejects_token_of_different_length(self):
        res = post(headers={"x-callback-token": "short"})
        assert res.status_code == 401

    def test_rejects_non_ascii_token_without_error(self):
        res = post(headers={"x-callback-token": "tökén".encode("utf-8")})
        assert res.status_code == 401

    def test_rejects_missing_token(self):
        assert post().status_code == 401

    def test_verifies_regardless_of_content_type(self):
        res = post(headers={"x-callback-token": TOKEN}, content_type="text/plain")
        assert res.status_code == 200


class TestRequestHandling:
    def test_invalid_json_returns_400(self):
        res = post(body="{not json", headers={"x-callback-token": TOKEN})
        assert res.status_code == 400

    def test_non_object_json_returns_400(self):
        res = post(body="[1,2,3]", headers={"x-callback-token": TOKEN})
        assert res.status_code == 400

    def test_does_not_parse_body_before_verifying_token(self):
        assert post(body="{not json").status_code == 401

    def test_handles_every_payments_api_event(self):
        for event in PAYMENT_EVENTS:
            res = post(body=json.dumps(payment_payload(event)), headers={"x-callback-token": TOKEN})
            assert res.status_code == 200, event

    def test_handles_invoice_callbacks_without_event_field(self):
        for status in ("PAID", "EXPIRED"):
            res = post(body=json.dumps(invoice_payload(status)), headers={"x-callback-token": TOKEN})
            assert res.status_code == 200

    def test_acknowledges_unknown_events(self):
        res = post(body=json.dumps(payment_payload("something.else")), headers={"x-callback-token": TOKEN})
        assert res.status_code == 200


class TestVerifyXenditToken:
    def test_rejects_everything_when_unconfigured(self):
        assert verify_xendit_token({"x-callback-token": "abc"}, "") is False

    def test_rejects_missing_header(self):
        assert verify_xendit_token({}, "abc") is False

    def test_accepts_exact_match(self):
        assert verify_xendit_token({"x-callback-token": "abc"}, "abc") is True


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
