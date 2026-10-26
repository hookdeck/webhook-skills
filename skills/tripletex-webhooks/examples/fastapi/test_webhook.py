import json
import os

# Set test environment variables before importing the app
os.environ["TRIPLETEX_WEBHOOK_HEADER"] = "X-Tripletex-Auth"
os.environ["TRIPLETEX_WEBHOOK_SECRET"] = "Bearer test_tripletex_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_tripletex_request

client = TestClient(app)

HEADER = os.environ["TRIPLETEX_WEBHOOK_HEADER"]
SECRET = os.environ["TRIPLETEX_WEBHOOK_SECRET"]

OBJECTS = [
    "supplier", "employee", "order", "product", "account", "project",
    "customer", "contact", "archiverelation", "voucher",
]
EVENTS = [
    "invoice.charged",
    *[f"{o}.{v}" for o in OBJECTS for v in ("create", "update", "delete")],
    "notification.sent",
    "voucherstatus.ready",
    "closegroup.create",
    "closegroup.delete",
]


def sample_payload(event="product.create"):
    return {
        "subscriptionId": 42,
        "event": event,
        "id": 1001,
        "value": None if event.endswith(".delete") else {"id": 1001, "version": 3, "name": "Consulting hour"},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/tripletex",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthenticationHeader:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_whole_value_is_compared(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_different_header_is_not_read(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest on str raises TypeError for non-ASCII; the bytes digests do not.
        assert verify_tripletex_request({HEADER: "pässord"}, secret=SECRET, header_name=HEADER) is False
        assert verify_tripletex_request({HEADER: "pässord"}, secret="pässord", header_name=HEADER) is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_tripletex_request({HEADER: SECRET}, secret="", header_name=HEADER) is False
        assert verify_tripletex_request({HEADER: SECRET}, secret=SECRET, header_name=HEADER) is True

    def test_header_name_defaults_to_authorization(self, monkeypatch):
        monkeypatch.delenv("TRIPLETEX_WEBHOOK_HEADER")
        assert verify_tripletex_request({"Authorization": SECRET}) is True
        assert verify_tripletex_request({HEADER: SECRET}) is False


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("widget.explode")))
        assert res.status_code == 200
        assert "Unhandled event: widget.explode" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
