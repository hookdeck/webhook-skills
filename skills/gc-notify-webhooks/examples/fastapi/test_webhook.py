import json
import os

# Set test environment variables before importing the app
os.environ["GC_NOTIFY_WEBHOOK_SECRET"] = "test_gc_notify_bearer_token_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_gc_notify_request

client = TestClient(app)

SECRET = os.environ["GC_NOTIFY_WEBHOOK_SECRET"]
AUTH = f"Bearer {SECRET}"

STATUSES = [
    "created", "sending", "pending", "sent", "delivered", "permanent-failure",
    "temporary-failure", "technical-failure", "pending-virus-check", "virus-scan-failed",
]


def receipt(status="delivered"):
    # Built from the field table in the GC Notify callbacks documentation (not a captured delivery).
    return {
        "id": "3b0f9c1e-6d6b-4a6c-9f1e-0a4d3d3f9e11",
        "reference": "12345678",
        "to": "hello@canada.ca",
        "status": status,
        "status_description": "Delivered",
        "provider_response": None,
        "created_at": "2017-05-14T12:15:30.000000Z",
        "completed_at": "2017-05-14T12:15:30.000000Z",
        "sent_at": "2017-05-14T12:15:30.000000Z",
        "notification_type": "email",
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(receipt())
    return client.post(
        "/webhooks/gc-notify",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBearerVerification:
    def test_correct_token(self):
        res = post({"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    @pytest.mark.parametrize("scheme", ["bearer", "BEARER", "BeArEr"])
    def test_scheme_is_case_insensitive(self, scheme):
        assert post({"Authorization": f"{scheme} {SECRET}"}).status_code == 200

    def test_wrong_token_same_length(self):
        assert post({"Authorization": f"Bearer {'x' * len(SECRET)}"}).status_code == 401

    def test_wrong_token_different_length(self):
        assert post({"Authorization": "Bearer short"}).status_code == 401

    def test_bare_secret_without_scheme(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_other_scheme(self):
        assert post({"Authorization": f"Basic {SECRET}"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        headers = {"authorization": AUTH}
        assert verify_gc_notify_request(headers, "") is False
        assert verify_gc_notify_request(headers, "Bearer ") is False

    def test_secret_pasted_with_scheme(self):
        headers = {"authorization": AUTH}
        assert verify_gc_notify_request(headers, f"Bearer {SECRET}") is True
        assert verify_gc_notify_request(headers, f"bearer {SECRET}") is True

    def test_non_ascii_secret_compares_bytes(self):
        secret = "pässwörd-✓"
        # Header values reach the app as latin-1 decoded text of the raw bytes
        wire = secret.encode("utf-8").decode("latin-1")
        assert verify_gc_notify_request({"authorization": f"Bearer {wire}"}, secret) is True
        assert verify_gc_notify_request({"authorization": "Bearer other"}, secret) is False


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({"Authorization": AUTH}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({"Authorization": AUTH}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"Authorization": AUTH}, body="[1,2]").status_code == 400

    def test_invalid_json_without_token_is_401(self):
        assert post(body="{not json").status_code == 401


class TestReceiptHandling:
    @pytest.mark.parametrize("status", STATUSES)
    def test_known_statuses(self, status, capsys):
        res = post({"Authorization": AUTH}, body=json.dumps(receipt(status)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_health_check_body(self, capsys):
        res = post({"Authorization": AUTH}, body=json.dumps({"health_check": "true"}))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_status_acknowledged(self):
        res = post({"Authorization": AUTH}, body=json.dumps(receipt("something-new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
