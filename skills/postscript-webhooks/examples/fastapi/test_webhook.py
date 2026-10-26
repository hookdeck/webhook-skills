import json
import os

# Set test environment variables before importing the app
os.environ["POSTSCRIPT_WEBHOOK_TOKEN"] = "test_postscript_token_0123456789abcdef"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_postscript_request

client = TestClient(app)

TOKEN = os.environ["POSTSCRIPT_WEBHOOK_TOKEN"]

EVENTS = [
    "shop.incoming_message",
    "shop.subscriber.opt_in",
    "shop.subscriber.opt_out",
    "shop.email_collected",
]


def sample_payload(event="shop.incoming_message"):
    return {
        "webhook_id": "89066f0a-eb36-4ed8-b98c-606e6dcac715",
        "resource_type": "shop",
        "resource_id": "shop_1234567abcd",
        "event_time": "2021-11-04T21:52:41.025455",
        "event": event,
        "event_data": {
            "id": "im_1b2a005a386281c9",
            "subscriber_id": "s_1234567abcd",
            "shop_id": "shop_1234567abcd",
            "from_number": "+15555555555",
            "body": "Hello, world",
        },
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/postscript",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSignatureVerification:
    def test_correct_token(self):
        res = post({"Postscript-Signature": TOKEN})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"postscript-signature": TOKEN}).status_code == 200

    def test_wrong_token_same_length(self):
        assert post({"Postscript-Signature": "x" * len(TOKEN)}).status_code == 401

    def test_wrong_token_different_length(self):
        assert post({"Postscript-Signature": "short"}).status_code == 401

    def test_whole_value_is_compared(self):
        assert post({"Postscript-Signature": f"v1={TOKEN}"}).status_code == 401
        assert post({"Postscript-Signature": TOKEN[:-1]}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_non_ascii_header_does_not_raise(self):
        assert verify_postscript_request({"postscript-signature": "tökén"}, token=TOKEN) is False
        assert verify_postscript_request({"postscript-signature": TOKEN}, token="tökén") is False

    def test_unconfigured_token_rejects_everything(self):
        assert verify_postscript_request({"postscript-signature": TOKEN}, token="") is False
        assert verify_postscript_request({"postscript-signature": TOKEN}, token=TOKEN) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Postscript-Signature": TOKEN}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"Postscript-Signature": TOKEN}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"Postscript-Signature": TOKEN}, body="[1,2]").status_code == 400

    def test_invalid_json_without_token_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({"Postscript-Signature": TOKEN}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"Postscript-Signature": TOKEN}, body=json.dumps(sample_payload("shop.something_new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
