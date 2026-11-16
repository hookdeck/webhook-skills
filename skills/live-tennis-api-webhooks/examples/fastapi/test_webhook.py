from __future__ import annotations

import hashlib
import hmac
import itertools
import json
import os
import re
import time

import pytest
from fastapi.testclient import TestClient

# The webhook secret is an opaque string returned by POST /webhooks and used
# as-is (UTF-8) as the HMAC key.
TEST_SECRET = "ltapi_whsec_test_9f2c1b7e4a6d8053"
os.environ["LIVE_TENNIS_API_WEBHOOK_SECRET"] = TEST_SECRET

from main import app  # noqa: E402

client = TestClient(app)
_ids = itertools.count(1)


def now() -> int:
    return int(time.time())


def frame(**fields) -> dict:
    return {"delivery_id": f"test_delivery_{next(_ids)}", **fields}


FRAMES = {
    "score": lambda: frame(type="score", match_id=4711, sequence=118),
    "score_withdrawn": lambda: frame(type="score_withdrawn", match_id=4711, kind="withdrawn", superseded_sequence=118),
    "point": lambda: frame(type="point", match_id=4711, point={"seq": 42}, pbp_coverage="point", quality="clean"),
    "break_point": lambda: frame(type="break_point", match_id=4711, server=2, returner=1, break_points=1),
    "break_point_result": lambda: frame(type="break_point_result", match_id=4711, server=2, outcome="broken"),
    "status": lambda: frame(type="status", match_id=4711),
}


def hmac_hex(payload: str, t: int, secret: str = TEST_SECRET) -> str:
    return hmac.new(secret.encode(), f"{t}.{payload}".encode(), hashlib.sha256).hexdigest()


def sign(payload: str, t: int | None = None, secret: str = TEST_SECRET) -> str:
    """X-LTAPI-Signature-V1: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">."""
    t = now() if t is None else t
    return f"t={t},v1={hmac_hex(payload, t, secret)}"


def post(payload: str, headers: dict = None, content_type: str = "application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    return client.post("/webhooks/live-tennis-api", content=payload.encode(), headers=all_headers)


class TestValidSignatures:
    def test_accepts_valid_signature(self):
        payload = json.dumps(FRAMES["score"]())
        res = post(payload, {"X-LTAPI-Signature-V1": sign(payload), "X-LTAPI-Event": "score"})
        assert res.status_code == 200
        assert res.json() == {"received": True, "event": "score"}

    @pytest.mark.parametrize("name", list(FRAMES))
    def test_handles_each_event(self, name):
        payload = json.dumps(FRAMES[name]())
        res = post(payload, {"X-LTAPI-Signature-V1": sign(payload), "X-LTAPI-Event": name})
        assert res.status_code == 200
        assert res.json()["event"] == name

    def test_accepts_when_any_v1_matches(self):
        payload = json.dumps(FRAMES["score"]())
        t = now()
        header = f"t={t},v1={hmac_hex(payload, t, 'old_secret')},v1={hmac_hex(payload, t)}"
        assert post(payload, {"X-LTAPI-Signature-V1": header}).status_code == 200

    def test_accepts_uppercase_hex(self):
        payload = json.dumps(FRAMES["score"]())
        t = now()
        header = f"t={t},v1={hmac_hex(payload, t).upper()}"
        assert post(payload, {"X-LTAPI-Signature-V1": header}).status_code == 200

    def test_repeated_delivery_id_is_acknowledged_once(self):
        payload = json.dumps(FRAMES["point"]())
        first = post(payload, {"X-LTAPI-Signature-V1": sign(payload)})
        second = post(payload, {"X-LTAPI-Signature-V1": sign(payload)})
        assert first.json() == {"received": True, "event": "point"}
        assert second.status_code == 200
        assert second.json()["duplicate"] is True

    def test_falls_back_to_event_header_when_body_has_no_type(self):
        payload = json.dumps(frame(match_id=4711, outcome="held"))
        res = post(payload, {"X-LTAPI-Signature-V1": sign(payload), "X-LTAPI-Event": "break_point_result"})
        assert res.status_code == 200
        assert res.json()["event"] == "break_point_result"

    def test_acknowledges_unknown_events(self):
        payload = json.dumps(frame(type="something_new", match_id=1))
        assert post(payload, {"X-LTAPI-Signature-V1": sign(payload)}).status_code == 200

    @pytest.mark.parametrize("content_type", ["text/plain", "application/octet-stream", "application/vnd.api+json"])
    def test_verifies_regardless_of_content_type(self, content_type):
        payload = json.dumps(FRAMES["point"]())
        assert post(payload, {"X-LTAPI-Signature-V1": sign(payload)}, content_type).status_code == 200


class TestInvalidSignatures:
    def test_rejects_stale_timestamp(self):
        payload = json.dumps(FRAMES["score"]())
        assert post(payload, {"X-LTAPI-Signature-V1": sign(payload, now() - 301)}).status_code == 401

    def test_rejects_restamped_replay(self):
        payload = json.dumps(FRAMES["score"]())
        restamped = re.sub(r"^t=\d+", f"t={now()}", sign(payload, now() - 600))
        assert post(payload, {"X-LTAPI-Signature-V1": restamped}).status_code == 401

    def test_rejects_tampered_body(self):
        payload = json.dumps(FRAMES["score"]())
        assert post(payload.replace("118", "999"), {"X-LTAPI-Signature-V1": sign(payload)}).status_code == 401

    def test_rejects_wrong_secret(self):
        payload = json.dumps(FRAMES["score"]())
        assert post(payload, {"X-LTAPI-Signature-V1": sign(payload, secret="another_secret")}).status_code == 401

    def test_does_not_fall_back_to_deprecated_header(self):
        payload = json.dumps(FRAMES["score"]())
        legacy = "sha256=" + hmac.new(TEST_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
        assert post(payload, {"X-LTAPI-Signature": legacy}).status_code == 400

    def test_rejects_missing_header(self):
        assert post(json.dumps(FRAMES["score"]())).status_code == 400

    def test_rejects_malformed_headers(self):
        payload = json.dumps(FRAMES["score"]())
        t = now()
        good = hmac_hex(payload, t)
        for header in [f"v1={good}", f"t={t}", f"t=abc,v1={good}", f"t={t},v1={'z' * 64}", f"t={t},v1={good[:62]}", f"sha256={good}"]:
            assert post(payload, {"X-LTAPI-Signature-V1": header}).status_code == 401

    def test_non_ascii_header_is_401_not_500(self):
        payload = json.dumps(FRAMES["score"]())
        # httpx sends header values as bytes; Starlette decodes them as latin-1
        res = client.post(
            "/webhooks/live-tennis-api",
            content=payload.encode(),
            headers=[(b"content-type", b"application/json"), (b"x-ltapi-signature-v1", f"t={now()},v1=é".encode("latin-1"))],
        )
        assert res.status_code == 401

    def test_rejects_invalid_json_with_valid_signature(self):
        payload = "not json"
        assert post(payload, {"X-LTAPI-Signature-V1": sign(payload)}, "text/plain").status_code == 400

    def test_rejects_non_object_json(self):
        payload = "[1, 2]"
        assert post(payload, {"X-LTAPI-Signature-V1": sign(payload)}).status_code == 400


def test_returns_500_when_secret_missing(monkeypatch):
    monkeypatch.delenv("LIVE_TENNIS_API_WEBHOOK_SECRET")
    payload = json.dumps(FRAMES["score"]())
    assert post(payload, {"X-LTAPI-Signature-V1": sign(payload)}).status_code == 500
