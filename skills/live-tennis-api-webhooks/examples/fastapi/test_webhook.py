import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# The webhook secret is an opaque string returned by POST /webhooks and used
# as-is (UTF-8) as the HMAC key.
TEST_SECRET = "ltapi_whsec_test_9f2c1b7e4a6d8053"
os.environ["LIVE_TENNIS_API_WEBHOOK_SECRET"] = TEST_SECRET

from main import app  # noqa: E402

client = TestClient(app)

FRAMES = {
    "score": {"type": "score", "match_id": 4711, "sets": [1, 0], "games": [[6, 3], [2, 1]], "points": {"p1": "30", "p2": "15"}, "server": 1, "is_tiebreak": False, "sequence": 118},
    "point": {"type": "point", "match_id": 4711, "point": {"seq": 42, "set": 2, "game": 4, "number": 3, "tiebreak": False, "server": 1, "winner": 1, "score": {"p1": "40", "p2": "15"}}, "pbp_coverage": "point", "quality": "clean"},
    "break_point": {"type": "break_point", "match_id": 4711, "server": 2, "returner": 1, "break_points": 1, "set": 2, "game": 5, "point": "30-40", "win_probability_p1": 0.61},
    "break_point_result": {"type": "break_point_result", "match_id": 4711, "server": 2, "outcome": "broken", "win_probability_p1_after": 0.72},
}


def sign(payload: str, secret: str = TEST_SECRET) -> str:
    """X-LTAPI-Signature: sha256=<hex HMAC-SHA256 of the raw body>."""
    return "sha256=" + hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def post(payload: str, headers: dict = None, content_type: str = "application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    return client.post("/webhooks/live-tennis-api", content=payload.encode(), headers=all_headers)


class TestValidSignatures:
    def test_accepts_valid_signature(self):
        payload = json.dumps(FRAMES["score"])
        res = post(payload, {"X-LTAPI-Signature": sign(payload), "X-LTAPI-Event": "score"})
        assert res.status_code == 200
        assert res.json() == {"received": True, "event": "score"}

    @pytest.mark.parametrize("name", list(FRAMES))
    def test_handles_each_event(self, name):
        payload = json.dumps(FRAMES[name])
        res = post(payload, {"X-LTAPI-Signature": sign(payload), "X-LTAPI-Event": name})
        assert res.status_code == 200
        assert res.json()["event"] == name

    def test_falls_back_to_event_header_when_body_has_no_type(self):
        payload = json.dumps({"match_id": 4711, "outcome": "held"})
        res = post(payload, {"X-LTAPI-Signature": sign(payload), "X-LTAPI-Event": "break_point_result"})
        assert res.status_code == 200
        assert res.json()["event"] == "break_point_result"

    def test_acknowledges_unknown_events(self):
        payload = json.dumps({"type": "something_new", "match_id": 1})
        res = post(payload, {"X-LTAPI-Signature": sign(payload)})
        assert res.status_code == 200

    def test_accepts_uppercase_hex(self):
        payload = json.dumps(FRAMES["score"])
        upper = "sha256=" + sign(payload)[len("sha256="):].upper()
        assert post(payload, {"X-LTAPI-Signature": upper}).status_code == 200

    @pytest.mark.parametrize("content_type", ["text/plain", "application/octet-stream", "application/vnd.api+json"])
    def test_verifies_regardless_of_content_type(self, content_type):
        payload = json.dumps(FRAMES["point"])
        assert post(payload, {"X-LTAPI-Signature": sign(payload)}, content_type).status_code == 200

    def test_ignores_unsigned_timestamp(self):
        payload = json.dumps(FRAMES["score"])
        res = post(payload, {"X-LTAPI-Signature": sign(payload), "X-LTAPI-Timestamp": "1"})
        assert res.status_code == 200


class TestInvalidSignatures:
    def test_rejects_tampered_body(self):
        payload = json.dumps(FRAMES["score"])
        tampered = json.dumps({**FRAMES["score"], "sequence": 999})
        assert post(tampered, {"X-LTAPI-Signature": sign(payload)}).status_code == 401

    def test_rejects_wrong_secret(self):
        payload = json.dumps(FRAMES["score"])
        assert post(payload, {"X-LTAPI-Signature": sign(payload, "another_secret")}).status_code == 401

    def test_rejects_missing_header(self):
        assert post(json.dumps(FRAMES["score"])).status_code == 400

    def test_rejects_digest_without_prefix(self):
        payload = json.dumps(FRAMES["score"])
        bare = sign(payload)[len("sha256="):]
        assert post(payload, {"X-LTAPI-Signature": bare}).status_code == 401

    def test_rejects_non_hex_and_wrong_length(self):
        payload = json.dumps(FRAMES["score"])
        good = sign(payload)[len("sha256="):]
        for header in ["sha256=" + "z" * 64, "sha256=" + good[:62], "sha256=" + good + "00", "sha256=", "sha1=" + good]:
            assert post(payload, {"X-LTAPI-Signature": header}).status_code == 401

    def test_non_ascii_header_is_401_not_500(self):
        payload = json.dumps(FRAMES["score"])
        # httpx sends header values as bytes; Starlette decodes them as latin-1
        res = client.post(
            "/webhooks/live-tennis-api",
            content=payload.encode(),
            headers=[(b"content-type", b"application/json"), (b"x-ltapi-signature", "sha256=é".encode("latin-1"))],
        )
        assert res.status_code == 401

    def test_rejects_invalid_json_with_valid_signature(self):
        payload = "not json"
        assert post(payload, {"X-LTAPI-Signature": sign(payload)}, "text/plain").status_code == 400

    def test_rejects_non_object_json(self):
        payload = "[1, 2]"
        assert post(payload, {"X-LTAPI-Signature": sign(payload)}).status_code == 400


def test_returns_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("LIVE_TENNIS_API_WEBHOOK_SECRET")
    payload = json.dumps(FRAMES["score"])
    assert post(payload, {"X-LTAPI-Signature": sign(payload)}).status_code == 500
