import hashlib
import hmac
import itertools
import json
import os

# Set test environment variables before importing the app
os.environ["SEVALLA_WEBHOOK_SECRET"] = "whsec_abcdefghijklmnopqrstuvwxyz0123"
os.environ.pop("SEVALLA_WEBHOOK_SECRET_OLD", None)

import pytest
from fastapi.testclient import TestClient

from main import app, verify_sevalla_request

client = TestClient(app)

SECRET = os.environ["SEVALLA_WEBHOOK_SECRET"]

EVENTS = [
    "APP_CREATE", "APP_DEPLOY", "APP_UPDATE", "APP_DELETE",
    "STATIC_SITE_CREATE", "STATIC_SITE_DEPLOY", "STATIC_SITE_UPDATE", "STATIC_SITE_DELETE",
    "DATABASE_CREATE", "DATABASE_UPDATE", "DATABASE_DELETE",
]

_counter = itertools.count(1)


def sample_payload(event_type="APP_DEPLOY"):
    """Based on the APP_DEPLOY payload shown in Sevalla's docs."""
    return {
        "webhook_id": "d5f8a1c2-3b4e-4f6a-8b8c-9d0e1f2a3b4c",
        "event_id": f"evt-{next(_counter)}",
        "event_delivery_id": "f1e2d3c4-b5a6-4788-9a0b-c1d2e3f4a5b6",
        "type": event_type,
        "data": {
            "company_id": "0c9e3f5a-7b2d-4e1f-8a6c-5d4b3a2f1e0d",
            "app_id": "7f3c2b1a-9e8d-4c7b-a6f5-4e3d2c1b0a9f",
            "app_name": "storefront-x7k2m",
            "app_display_name": "storefront",
            "deployment_id": "3b2a1c0d-8e7f-4a6b-9c5d-2e1f0a9b8c7d",
            "status": "success",
            "commit": "9fceb02d0ae598e95dc970b74767f19372d61af8",
            "stage": "",
            "is_preview": False,
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/sevalla",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretVerification:
    def test_correct_secret(self):
        res = post({"svl-signature": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"SVL-Signature": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({"svl-signature": "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({"svl-signature": "short"}).status_code == 401

    def test_whole_value_required(self):
        assert post({"svl-signature": SECRET[len("whsec_"):]}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_empty_header(self):
        assert post({"svl-signature": ""}).status_code == 401

    def test_header_is_not_an_hmac_of_the_body(self):
        body = json.dumps(sample_payload())
        digest = hmac.new(SECRET.encode(), body.encode(), hashlib.sha256).hexdigest()
        assert post({"svl-signature": digest}, body=body).status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        headers = {"svl-signature": SECRET}
        assert verify_sevalla_request(headers, secrets=[]) is False
        assert verify_sevalla_request(headers, secrets=[None, ""]) is False
        assert verify_sevalla_request(headers, secrets=[SECRET]) is True

    def test_non_ascii_header_value_does_not_raise(self):
        assert verify_sevalla_request({"svl-signature": "whsec_é"}, secrets=[SECRET]) is False
        assert verify_sevalla_request({"svl-signature": SECRET}, secrets=["whsec_é"]) is False

    def test_old_secret_accepted_during_rollover(self):
        old = "whsec_oldoldoldoldoldoldoldoldold01"
        assert verify_sevalla_request({"svl-signature": old}, secrets=[SECRET, old]) is True
        assert verify_sevalla_request({"svl-signature": old}, secrets=[SECRET]) is False


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"svl-signature": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"svl-signature": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"svl-signature": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post({"svl-signature": SECRET}, body=json.dumps(sample_payload(event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"svl-signature": SECRET}, body=json.dumps(sample_payload("SOMETHING_NEW")))
        assert res.status_code == 200

    def test_retry_with_same_event_id_is_dropped(self):
        body = json.dumps(sample_payload("APP_DEPLOY"))
        first = post({"svl-signature": SECRET}, body=body)
        second = post({"svl-signature": SECRET}, body=body)
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
