import base64
import hashlib
import hmac
import json
import os
import uuid

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app.
# Verifier Tokens are opaque strings used directly as the HMAC key (no prefix, no decoding).
os.environ["QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN"] = "test_verifier_token_0a1b2c3d"

from main import app, normalize_events, verify_quickbooks_signature  # noqa: E402

client = TestClient(app)
VERIFIER_TOKEN = os.environ["QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN"]


def generate_quickbooks_signature(payload: str, token: str) -> str:
    """Generate a valid intuit-signature: base64(HMAC-SHA256(raw_body, verifier_token))."""
    return base64.b64encode(
        hmac.new(token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).decode("utf-8")


def cloud_event(event_type: str, **overrides) -> dict:
    event = {
        "specversion": "1.0",
        "id": str(uuid.uuid4()),
        "source": "intuit.dsnBgbseACLLRZNxo2dfc4evmEJdxde58xeeYcZliOU=",
        "type": event_type,
        "datacontenttype": "application/json",
        "time": "2026-09-10T21:31:25Z",
        "intuitentityid": "1234",
        "intuitaccountid": "310687",
        "data": {},
    }
    event.update(overrides)
    return event


def legacy_payload(operation: str = "Create", name: str = "Customer") -> dict:
    return {
        "eventNotifications": [
            {
                "realmId": "310687",
                "dataChangeEvent": {
                    "entities": [
                        {"name": name, "id": "1", "operation": operation, "lastUpdated": "2025-10-05T14:42:19-0700"}
                    ]
                },
            }
        ]
    }


def post(body: str, signature=None):
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if signature is not None:
        headers["intuit-signature"] = signature
    return client.post("/webhooks/quickbooks", content=body, headers=headers)


def post_signed(body: str):
    return post(body, generate_quickbooks_signature(body, VERIFIER_TOKEN))


class TestVerifyQuickBooksSignature:
    def test_valid_signature(self):
        body = '[{"type":"qbo.invoice.created.v1"}]'
        sig = generate_quickbooks_signature(body, VERIFIER_TOKEN)
        assert verify_quickbooks_signature(body.encode(), sig, VERIFIER_TOKEN) is True

    def test_invalid_signature(self):
        assert verify_quickbooks_signature(b"{}", "invalid", VERIFIER_TOKEN) is False

    def test_hex_signature_rejected(self):
        hex_sig = hmac.new(VERIFIER_TOKEN.encode(), b"{}", hashlib.sha256).hexdigest()
        assert verify_quickbooks_signature(b"{}", hex_sig, VERIFIER_TOKEN) is False

    def test_wrong_token(self):
        sig = generate_quickbooks_signature("{}", "other_token")
        assert verify_quickbooks_signature(b"{}", sig, VERIFIER_TOKEN) is False

    def test_tampered_body(self):
        sig = generate_quickbooks_signature('{"amount":100}', VERIFIER_TOKEN)
        assert verify_quickbooks_signature(b'{"amount":999}', sig, VERIFIER_TOKEN) is False

    def test_missing_signature(self):
        assert verify_quickbooks_signature(b"{}", None, VERIFIER_TOKEN) is False

    def test_non_ascii_signature_does_not_raise(self):
        assert verify_quickbooks_signature(b"{}", "sïgnature", VERIFIER_TOKEN) is False


class TestNormalizeEvents:
    def test_cloudevents(self):
        [event] = normalize_events([cloud_event("qbo.salesreceipt.updated.v1", intuitentityid="150")])
        assert event["entity"] == "salesreceipt"
        assert event["action"] == "updated"
        assert event["entity_id"] == "150"
        assert event["realm_id"] == "310687"

    def test_legacy_maps_operations(self):
        [event] = normalize_events(legacy_payload("Merge"))
        assert event["type"] == "qbo.customer.merged.v1"
        assert event["action"] == "merged"
        assert event["realm_id"] == "310687"

    def test_unrecognized(self):
        assert normalize_events({"foo": "bar"}) is None


class TestQuickBooksWebhook:
    def test_missing_signature_returns_400(self):
        response = post(json.dumps([cloud_event("qbo.invoice.created.v1")]))
        assert response.status_code == 400

    def test_invalid_signature_returns_400(self):
        response = post(json.dumps([cloud_event("qbo.invoice.created.v1")]), "aW52YWxpZA==")
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_valid_cloudevents_returns_200(self):
        response = post_signed(json.dumps([cloud_event("qbo.invoice.created.v1")]))
        assert response.status_code == 200
        assert response.json() == {"received": True, "count": 1}

    def test_multiple_companies(self):
        body = json.dumps(
            [
                cloud_event("qbo.invoice.created.v1", intuitaccountid="111"),
                cloud_event("qbo.payment.created.v1", intuitaccountid="222"),
                cloud_event("qbo.customer.merged.v1", intuitaccountid="333", data={"deletedid": "27"}),
            ]
        )
        response = post_signed(body)
        assert response.status_code == 200
        assert response.json()["count"] == 3

    @pytest.mark.parametrize(
        "event_type",
        [
            "qbo.invoice.created.v1",
            "qbo.invoice.updated.v1",
            "qbo.invoice.deleted.v1",
            "qbo.invoice.voided.v1",
            "qbo.invoice.emailed.v1",
            "qbo.payment.created.v1",
            "qbo.customer.created.v1",
            "qbo.customer.updated.v1",
            "qbo.customer.merged.v1",
            "qbo.salesreceipt.updated.v1",
            "qbo.employee.created.v1",
        ],
    )
    def test_event_types(self, event_type):
        response = post_signed(json.dumps([cloud_event(event_type)]))
        assert response.status_code == 200, f"Failed for {event_type}"

    def test_event_without_data(self):
        event = cloud_event("qbo.salesreceipt.updated.v1")
        del event["data"]
        del event["datacontenttype"]
        response = post_signed(json.dumps([event]))
        assert response.status_code == 200

    def test_legacy_payload_returns_200(self):
        response = post_signed(json.dumps(legacy_payload("Update", "Invoice")))
        assert response.status_code == 200
        assert response.json()["count"] == 1

    def test_raw_body_whitespace(self):
        body = '[ {"type": "qbo.invoice.created.v1", "intuitentityid": "1", "intuitaccountid": "2"} ]'
        response = post_signed(body)
        assert response.status_code == 200

    def test_unrecognized_payload_returns_400(self):
        response = post_signed(json.dumps({"hello": "world"}))
        assert response.status_code == 400

    def test_invalid_json_returns_400(self):
        response = post_signed("not json")
        assert response.status_code == 400


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
