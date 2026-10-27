import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

os.environ["SURVEYMETHODS_WEBHOOK_SECRET"] = "surveymethods_test_signing_secret"

from main import app, verify_surveymethods_signature  # noqa: E402

SECRET = os.environ["SURVEYMETHODS_WEBHOOK_SECRET"]
client = TestClient(app)


def digest(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + digest(body, secret)


def event_body(event_type: str, data: dict | None = None) -> bytes:
    return json.dumps(
        {"eventId": "evt_1", "eventType": event_type, "eventTime": "2026-10-23T10:15:02Z", "data": data or {}}
    ).encode()


# Shape of the vendor's documented response.completed sample
COMPLETED = json.dumps(
    {
        "eventId": "6a1f0c3e-2b9d-4f7a-9c51-0e8d2f4b7a10",
        "eventType": "response.completed",
        "eventTime": "2026-10-23T10:15:02Z",
        "data": {
            "surveyId": "12345",
            "respondentId": 6789,
            "collectorId": 456,
            "completedDateTimeUtc": "2026-10-23T10:15:00Z",
            "responses": {"910001": "3", "910002": "Great support team."},
        },
    }
).encode()
JSON_HEADERS = {"Content-Type": "application/json"}


class TestVerify:
    def test_valid(self):
        assert verify_surveymethods_signature(COMPLETED, sign(COMPLETED), SECRET)
        assert verify_surveymethods_signature(COMPLETED, digest(COMPLETED), SECRET)
        assert verify_surveymethods_signature(COMPLETED, "sha256=" + digest(COMPLETED).upper(), SECRET)

    def test_invalid_variants(self):
        assert not verify_surveymethods_signature(COMPLETED, sign(COMPLETED, "other"), SECRET)
        assert not verify_surveymethods_signature(COMPLETED, None, SECRET)
        assert not verify_surveymethods_signature(COMPLETED, "", SECRET)
        assert not verify_surveymethods_signature(COMPLETED, "sha256=abcd", SECRET)
        assert not verify_surveymethods_signature(COMPLETED, "sha256=" + "é" * 64, SECRET)


class TestEndpoint:
    @pytest.mark.parametrize(
        "body",
        [
            COMPLETED,
            event_body("response.created", {"surveyId": "12345"}),
            event_body("survey.created", {"surveyId": "12345"}),
            event_body("collector.created", {"collectorId": 456}),
            event_body("something.else"),
        ],
    )
    def test_signed_event(self, body):
        res = client.post(
            "/webhooks/surveymethods",
            content=body,
            headers={**JSON_HEADERS, "X-SurveyMethods-Signature": sign(body)},
        )
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_bare_digest_and_unusual_content_type(self):
        res = client.post(
            "/webhooks/surveymethods",
            content=COMPLETED,
            headers={"Content-Type": "text/plain", "X-SurveyMethods-Signature": digest(COMPLETED)},
        )
        assert res.status_code == 200

    def test_unsigned_rejected(self):
        res = client.post("/webhooks/surveymethods", content=COMPLETED, headers=JSON_HEADERS)
        assert res.status_code == 401

    def test_bad_signature_rejected(self):
        res = client.post(
            "/webhooks/surveymethods",
            content=COMPLETED,
            headers={**JSON_HEADERS, "X-SurveyMethods-Signature": sign(COMPLETED, "wrong")},
        )
        assert res.status_code == 401

    def test_tampered_body_rejected(self):
        res = client.post(
            "/webhooks/surveymethods",
            content=COMPLETED.replace(b"12345", b"99999"),
            headers={**JSON_HEADERS, "X-SurveyMethods-Signature": sign(COMPLETED)},
        )
        assert res.status_code == 401

    def test_non_ascii_signature_header_is_401_not_500(self):
        res = client.post(
            "/webhooks/surveymethods",
            content=COMPLETED,
            headers={**JSON_HEADERS, "X-SurveyMethods-Signature": "sha256=é".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_malformed_signed_json(self):
        bad = b"{not json"
        res = client.post(
            "/webhooks/surveymethods",
            content=bad,
            headers={**JSON_HEADERS, "X-SurveyMethods-Signature": sign(bad)},
        )
        assert res.status_code == 400

    @pytest.mark.parametrize("body", [b"null", b"42", b"[1,2]"])
    def test_signed_non_object_body(self, body):
        res = client.post(
            "/webhooks/surveymethods",
            content=body,
            headers={**JSON_HEADERS, "X-SurveyMethods-Signature": sign(body)},
        )
        assert res.status_code == 400
