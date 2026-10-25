import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# The Signing Secret is an opaque string used as-is; this one is only for tests
SECRET = "test_zigpoll_signing_secret_5b2e"
os.environ["ZIGPOLL_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def now_ms() -> int:
    return int(time.time() * 1000)


def v1_of(body: str, t: int, secret=SECRET) -> str:
    return hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()


def sign(body: str, t=None, secret=SECRET) -> str:
    # t is unix milliseconds
    t = now_ms() if t is None else t
    return f"t={t},v1={v1_of(body, t, secret)}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Zigpoll-Signature"] = signature
    return client.post("/webhooks/zigpoll", content=body, headers=headers)


SUBMITTED = json.dumps({
    "type": "submitted-responses",
    "accountId": "acc_1",
    "pollId": "poll_1",
    "participantId": "p_1",
    "metadata": {},
    "responses": {"q1": "Great"},
    "submissionsComplete": False,
    "timestamp": 1754400000000,
    "email": "jane@example.com",
    "emails": ["jane@example.com"],
})


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(SUBMITTED, sign(SUBMITTED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(SUBMITTED, sign(SUBMITTED), "text/plain").status_code == 200

    def test_allows_space_after_comma_and_uppercase_hex(self):
        t = now_ms()
        header = f"t={t}, v1={v1_of(SUBMITTED, t).upper()}"
        assert post(SUBMITTED, header).status_code == 200

    def test_accepts_when_any_v1_matches(self):
        t = now_ms()
        header = f"t={t},v1={v1_of(SUBMITTED, t, 'old_secret')},v1={v1_of(SUBMITTED, t)}"
        assert post(SUBMITTED, header).status_code == 200

    def test_rejects_missing_header(self):
        assert post(SUBMITTED).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(SUBMITTED.replace("Great", "Awful"), sign(SUBMITTED)).status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(SUBMITTED, sign(SUBMITTED, secret="other_secret")).status_code == 401

    def test_rejects_signature_of_different_length(self):
        assert post(SUBMITTED, "t=1754400000000,v1=abc").status_code == 401

    def test_rejects_non_ascii_header_without_500(self):
        # httpx only encodes ASCII str headers, so send the raw UTF-8 bytes
        header = f"t={now_ms()},v1=é{'a' * 63}".encode("utf-8")
        assert post(SUBMITTED, header).status_code == 401

    def test_rejects_header_without_t_or_v1(self):
        assert post(SUBMITTED, "garbage").status_code == 401
        assert post(SUBMITTED, f"v1={v1_of(SUBMITTED, 1)}").status_code == 401
        assert post(SUBMITTED, "t=1754400000000").status_code == 401
        assert post(SUBMITTED, "t=abc,v1=deadbeef").status_code == 401

    def test_rejects_altered_timestamp(self):
        header = sign(SUBMITTED, 1754400000000).replace("t=1754400000000", "t=1754400000001")
        assert post(SUBMITTED, header).status_code == 401

    def test_accepts_old_timestamp_by_default(self):
        # Hookdeck retries and replays keep the original timestamp
        assert post(SUBMITTED, sign(SUBMITTED, now_ms() - 3600 * 1000)).status_code == 200

    def test_tolerance_treats_t_as_milliseconds(self, monkeypatch):
        monkeypatch.setenv("ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS", "300")
        assert post(SUBMITTED, sign(SUBMITTED, now_ms() - 3600 * 1000)).status_code == 401
        assert post(SUBMITTED, sign(SUBMITTED, now_ms() - 60 * 1000)).status_code == 200
        assert post(SUBMITTED, sign(SUBMITTED)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("ZIGPOLL_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        assert post(SUBMITTED, sign(SUBMITTED, now_ms() - 3600 * 1000)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize("event_type", ["submitted-responses", "completed-survey"])
    def test_dispatch(self, caplog, event_type):
        body = json.dumps({
            "type": event_type, "pollId": "poll_1", "participantId": "p_1",
            "submissionsComplete": event_type == "completed-survey",
        })
        with caplog.at_level(logging.INFO, logger="zigpoll-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_acknowledges_unknown_type(self, caplog):
        body = json.dumps({"type": "something-else"})
        with caplog.at_level(logging.INFO, logger="zigpoll-webhooks"):
            assert post(body, sign(body)).status_code == 200
        assert "Unhandled event: something-else" in caplog.text

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_rejects_verified_non_object_json(self):
        body = "[1, 2]"
        assert post(body, sign(body)).status_code == 400
