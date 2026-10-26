import json
import os

# Set test environment variables before importing the app
os.environ["VENTRATA_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["VENTRATA_WEBHOOK_SECRET"] = "whsec_123456abcdef"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, normalize_event, verify_ventrata_request

client = TestClient(app)

HEADER = os.environ["VENTRATA_WEBHOOK_HEADER"]
SECRET = os.environ["VENTRATA_WEBHOOK_SECRET"]

EVENTS = [
    "order_update", "booking_update", "availability_update", "product_update",
    "order.updated", "booking.updated", "availability.updated", "product.updated",
]


def sample_payload(event="booking.updated"):
    return {
        "event": event,
        "webhook": {"id": "webhook_booking_update", "event": event, "url": "https://example.com/webhooks/ventrata"},
        "supplier": {"id": "3d6f0a3a-59d4-4b16-a0c5-11d2d8a4e6b7", "name": "City Sightseeing Group"},
        "order": {"orderId": "ord_20260514_9f3c21", "status": "ON_HOLD"},
        "booking": {"uuid": "89fe0192-ddcd-430a-b285-e1396a4725d2", "status": "ON_HOLD"},
        "product": {"id": "e7cc8bb4-8d1c-4848-8824-5dbedb718681", "internalName": "Walking Tour of Barcelona"},
        "availability": {"id": "94cdd032-3d32-416d-b0a4-abf8b7495b8b", "available": True},
        "diff": [{"op": "add", "path": "path-example", "was": "was-example", "value": "value-example"}],
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/ventrata",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretHeaderVerification:
    def test_correct_secret(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"x-webhook-secret": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_a_different_header_name(self):
        assert post({"X-Other-Header": SECRET}).status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_ventrata_request({HEADER: SECRET}, secret="") is False
        assert verify_ventrata_request({HEADER: SECRET}, secret=SECRET) is True

    def test_custom_header_name(self):
        assert verify_ventrata_request(Headers({"x-ventrata-key": "abc"}), "abc", "X-Ventrata-Key") is True
        assert verify_ventrata_request(Headers({HEADER: "abc"}), "abc", "X-Ventrata-Key") is False

    def test_whole_value_including_bearer_prefix(self):
        secret = "Bearer abc123"
        bearer, bare = Headers({"authorization": "Bearer abc123"}), Headers({"authorization": "abc123"})
        assert verify_ventrata_request(bearer, secret, "Authorization") is True
        assert verify_ventrata_request(bare, secret, "Authorization") is False
        assert verify_ventrata_request(bearer, "abc123", "Authorization") is False

    def test_non_ascii_values_do_not_raise(self):
        # hmac.compare_digest raises TypeError on non-ASCII str; the check compares bytes.
        # (httpx can't send non-ASCII header values, so call the function directly.)
        assert verify_ventrata_request({HEADER: "sécret"}, secret="sécret") is True
        assert verify_ventrata_request({HEADER: "secret"}, secret="sécret") is False


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

    def test_both_spellings_normalize_alike(self):
        assert normalize_event("booking.updated") == "booking_update"
        assert normalize_event("booking_update") == "booking_update"
        assert normalize_event("something_new") == "something_new"

    def test_unknown_event_is_acknowledged(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
