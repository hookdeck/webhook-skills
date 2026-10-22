import json
import os

import pytest
from fastapi.testclient import TestClient

API_KEY = "cg_test_api_key_0123456789"
os.environ["COVER_GENIUS_API_KEY"] = API_KEY

from main import app, verify_cover_genius_request  # noqa: E402

client = TestClient(app)


def booking(event, status="CONFIRMED"):
    return {
        "event": event,
        "payload": {
            "id": "8AMKH-KQ8NR-INS",
            "status": status,
            "currency": "USD",
            "total_price": 68.71,
            "total_price_formatted": "US$68.71",
            "partner_transaction_id": None,
            "quotes": [],
        },
    }


def renewal(event, status="ACTIVE"):
    return {
        "event": event,
        "payload": {
            "id": "daSJp-fwdoj-REN",
            "package_id": "GKDK9-CECQU-INS",
            "quote_id": "c8ddb161-e3d9-455b-9621-96df90f17acb",
            "status": status,
            "due_date": "2019-02-25T13:00:00Z",
            "expiry_date": "2019-03-25T13:00:00Z",
        },
    }


def post(body, headers=None, content_type="application/json"):
    if headers is None:
        headers = {"X-Api-Key": API_KEY}
    raw = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/cover-genius",
        content=raw,
        headers={"Content-Type": content_type, **headers},
    )


class TestAuthentication:
    def test_accepts_correct_api_key(self):
        res = post(booking("BOOKING_CREATED"))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_api_key(self):
        assert post(booking("BOOKING_CREATED"), headers={}).status_code == 401

    def test_rejects_wrong_api_key(self):
        assert post(booking("BOOKING_CREATED"), headers={"X-Api-Key": "wrong_key"}).status_code == 401

    def test_rejects_key_of_different_length(self):
        assert post(booking("BOOKING_CREATED"), headers={"X-Api-Key": "x"}).status_code == 401

    def test_rejects_prefixed_key(self):
        res = post(booking("BOOKING_CREATED"), headers={"X-Api-Key": f"Bearer {API_KEY}"})
        assert res.status_code == 401

    def test_does_not_accept_authorization_signature_alone(self):
        res = post(
            booking("BOOKING_CREATED"),
            headers={
                "Authorization": 'Signature keyId="x",algorithm="hmac-sha256",signature="abc"',
                "Date": "Thu, 27 Feb 2025 05:01:47 GMT",
            },
        )
        assert res.status_code == 401

    def test_accepts_any_content_type(self):
        res = post(booking("BOOKING_CREATED"), content_type="text/plain")
        assert res.status_code == 200

    def test_fails_closed_when_key_not_configured(self):
        assert verify_cover_genius_request({"x-api-key": "anything"}, api_key="") is False
        assert verify_cover_genius_request({"x-api-key": API_KEY}, api_key=API_KEY) is True


class TestEvents:
    @pytest.mark.parametrize(
        "body",
        [
            booking("BOOKING_CREATED"),
            booking("BOOKING_UPDATED"),
            booking("BOOKING_CANCELLED", "CANCELLED"),
            renewal("RENEWAL_CREATED"),
            renewal("RENEWAL_NOTIFICATION"),
            renewal("RENEWAL_DUE", "DUE"),
            renewal("RENEWAL_EXPIRED", "EXPIRED"),
        ],
        ids=lambda b: b["event"],
    )
    def test_handles_event(self, body):
        assert post(body).status_code == 200

    def test_acknowledges_unknown_events(self):
        assert post({"event": "SOMETHING_NEW", "payload": {}}).status_code == 200


class TestBodyValidation:
    def test_invalid_json_returns_400(self):
        assert post("not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert post("[1,2,3]").status_code == 400

    def test_bad_key_beats_bad_json(self):
        assert post("not json", headers={"X-Api-Key": "nope"}).status_code == 401
