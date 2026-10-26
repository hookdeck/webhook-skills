import base64
import json
import os

# Set test environment variables before importing the app
USERNAME = "rebilly_test_user"
PASSWORD = "p@ss:word/with:colons+and=signs"
os.environ["REBILLY_WEBHOOK_USERNAME"] = USERNAME
os.environ["REBILLY_WEBHOOK_PASSWORD"] = PASSWORD

import pytest
from fastapi.testclient import TestClient

from main import app, verify_rebilly_request

client = TestClient(app)

METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

EVENTS = {
    "transaction-processed": {"transactionId": "txn_123"},
    "transaction-declined": {"transactionId": "txn_124"},
    "customer-created": {"customerId": "cus_123"},
    "subscription-activated": {"subscriptionId": "sub_123"},
    "subscription-canceled": {"subscriptionId": "sub_124"},
    "invoice-issued": {"invoiceId": "inv_123"},
    "invoice-paid": {"invoiceId": "inv_124"},
}

# Payload as shown in Rebilly's documentation (data-export-completed).
DATA_EXPORT_COMPLETED = {
    "dataExportId": "d9dd134f-0bee-46b1-bec0-992da3173336",
    "fileId": "d348968b-41ed-4d7d-b534-02e5265c8912",
    "eventType": "data-export-completed",
    "_embedded": {
        "dataExport": {
            "id": "d9dd134f-0bee-46b1-bec0-992da3173336",
            "name": "Preview",
            "resource": "customers",
            "format": "csv",
            "status": "pending",
            "_links": [
                {
                    "rel": "self",
                    "href": "https://api-sandbox.rebilly.com/organizations/a9f68e6e-e2e6-43dd-a27f-8120121d7428/experimental/data-exports/d9dd134f-0bee-46b1-bec0-992da3173336",
                }
            ],
        }
    },
    "_links": [
        {
            "rel": "download",
            "href": "https://api-sandbox.rebilly.com/organizations/a9f68e6e-e2e6-43dd-a27f-8120121d7428/files/d348968b-41ed-4d7d-b534-02e5265c8912/download",
        }
    ],
}


def basic(username=USERNAME, password=PASSWORD):
    return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()


def payload_for(event_type):
    if event_type == "data-export-completed":
        return DATA_EXPORT_COMPLETED
    return {"eventType": event_type, **EVENTS[event_type], "_embedded": {}, "_links": []}


def send(method="POST", headers=None, body=None, content_type="application/json"):
    kwargs = {"headers": dict(headers or {})}
    if body is not None:
        kwargs["content"] = body
        kwargs["headers"]["Content-Type"] = content_type
    return client.request(method, "/webhooks/rebilly", **kwargs)


class TestBasicAuth:
    def test_accepts_correct_credentials(self):
        res = send(headers={"Authorization": basic()}, body=json.dumps(payload_for("transaction-processed")))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_lowercase_scheme_and_colons_in_password(self):
        res = send(
            headers={"Authorization": basic().replace("Basic", "basic")},
            body=json.dumps(payload_for("customer-created")),
        )
        assert res.status_code == 200

    def test_rejects_missing_header(self):
        res = send(body=json.dumps(payload_for("transaction-processed")))
        assert res.status_code == 401

    def test_rejects_wrong_password(self):
        assert send(headers={"Authorization": basic(USERNAME, "wrong")}, body="{}").status_code == 401

    def test_rejects_wrong_username(self):
        assert send(headers={"Authorization": basic("someone-else", PASSWORD)}, body="{}").status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert send(headers={"Authorization": f"Bearer {PASSWORD}"}, body="{}").status_code == 401

    def test_rejects_base64_with_trailing_junk(self):
        assert send(headers={"Authorization": basic() + "!!!"}, body="{}").status_code == 401

    def test_rejects_credentials_without_colon(self):
        header = "Basic " + base64.b64encode(b"nocolon").decode()
        assert send(headers={"Authorization": header}, body="{}").status_code == 401

    def test_does_not_read_body_before_authenticating(self):
        assert send(body="not json").status_code == 401


class TestMethods:
    @pytest.mark.parametrize("method", METHODS)
    def test_accepts_method_with_empty_body(self, method):
        res = send(method, headers={"Authorization": basic()})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("method", METHODS)
    def test_rejects_method_without_credentials(self, method):
        assert send(method).status_code == 401

    @pytest.mark.parametrize("method", ["PUT", "PATCH"])
    def test_handles_event_sent_with_method(self, method):
        res = send(method, headers={"Authorization": basic()}, body=json.dumps(payload_for("invoice-paid")))
        assert res.status_code == 200


class TestEvents:
    @pytest.mark.parametrize("event_type", [*EVENTS.keys(), "data-export-completed"])
    def test_handles_event_and_returns_exactly_200(self, event_type):
        res = send(headers={"Authorization": basic()}, body=json.dumps(payload_for(event_type)))
        assert res.status_code == 200

    def test_logs_handled_event(self, capsys):
        send(headers={"Authorization": basic()}, body=json.dumps(DATA_EXPORT_COMPLETED))
        assert "Data export completed: d9dd134f-0bee-46b1-bec0-992da3173336" in capsys.readouterr().out

    def test_unknown_event_returns_200(self):
        res = send(headers={"Authorization": basic()}, body=json.dumps({"eventType": "brand-new-event"}))
        assert res.status_code == 200

    def test_accepts_any_content_type(self):
        res = send(
            headers={"Authorization": basic()},
            body=json.dumps(payload_for("customer-created")),
            content_type="text/plain",
        )
        assert res.status_code == 200

    def test_invalid_json_returns_400_after_auth(self):
        assert send(headers={"Authorization": basic()}, body="{not json").status_code == 400

    def test_non_object_body_returns_400(self):
        assert send(headers={"Authorization": basic()}, body="[1,2,3]").status_code == 400


class TestVerifyFunction:
    def test_fails_closed_when_unconfigured(self):
        assert verify_rebilly_request({"authorization": basic()}, "", "") is False

    def test_explicit_credentials(self):
        assert verify_rebilly_request({"authorization": basic("a", "b")}, "a", "b") is True
        assert verify_rebilly_request({"authorization": basic("a", "b")}, "a", "c") is False

    def test_non_ascii_credentials_do_not_raise(self):
        assert verify_rebilly_request({"authorization": basic("usér", "pässwörd")}, "usér", "pässwörd") is True
        assert verify_rebilly_request({"authorization": basic("usér", "pässwörd")}, "user", "password") is False
