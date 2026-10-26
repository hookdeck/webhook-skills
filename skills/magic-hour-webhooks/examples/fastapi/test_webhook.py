import hashlib
import hmac
import json
import os
import time

import pytest

# Magic Hour secrets look like whsec_...; the whole string is the HMAC key
SECRET = "whsec_test_secret_0123456789abcdef"
os.environ["MAGIC_HOUR_WEBHOOK_SECRET"] = SECRET
os.environ.pop("MAGIC_HOUR_WEBHOOK_TOLERANCE_SECONDS", None)

from fastapi.testclient import TestClient

from main import app, verify_magic_hour_signature

client = TestClient(app)


def sign(body, timestamp, secret=SECRET):
    """Sign exactly as Magic Hour does: hex HMAC-SHA256 over `{timestamp}.{raw body}`."""
    if isinstance(body, str):
        body = body.encode()
    message = str(timestamp).encode("latin-1") + b"." + body
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def sample_payload(event_type="video.completed"):
    errored = event_type.endswith("errored")
    completed = event_type.endswith("completed")
    return {
        "type": event_type,
        "payload": {
            "id": "clx7uu86w0a5qp55yxz315r6r",
            "status": "error" if errored else "complete",
            "credits_charged": 450,
            "downloads": [
                {
                    "url": "https://videos.magichour.ai/clx7uu86w0a5qp55yxz315r6r/output.mp4",
                    "expires_at": "2024-10-19T05:16:19.027Z",
                }
            ]
            if completed
            else [],
            "error": {"code": "invalid_video_file", "message": "bad file"} if errored else None,
        },
    }


def now():
    return int(time.time())


def post(body, headers, content_type="application/json"):
    return client.post(
        "/webhooks/magic-hour",
        content=body,
        headers={"Content-Type": content_type, **headers},
    )


def signed_post(payload=None, timestamp=None):
    payload = payload if payload is not None else sample_payload()
    timestamp = timestamp if timestamp is not None else now()
    body = json.dumps(payload)
    return post(
        body,
        {"magic-hour-event-signature": sign(body, timestamp), "magic-hour-event-timestamp": str(timestamp)},
    )


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = signed_post()
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex(self):
        body = json.dumps(sample_payload())
        ts = now()
        res = post(
            body,
            {"magic-hour-event-signature": sign(body, ts).upper(), "magic-hour-event-timestamp": str(ts)},
        )
        assert res.status_code == 200

    def test_accepts_any_content_type(self):
        body = json.dumps(sample_payload())
        ts = now()
        res = post(
            body,
            {"magic-hour-event-signature": sign(body, ts), "magic-hour-event-timestamp": str(ts)},
            content_type="text/plain",
        )
        assert res.status_code == 200

    def test_verifies_exact_raw_bytes(self):
        body = '{ "type" : "video.completed",\n  "payload": {"id": "x"} }'
        ts = now()
        res = post(
            body,
            {"magic-hour-event-signature": sign(body, ts), "magic-hour-event-timestamp": str(ts)},
        )
        assert res.status_code == 200

    def test_accepts_old_timestamp_by_default(self):
        assert signed_post(timestamp=now() - 3600).status_code == 200

    def test_rejects_missing_signature(self):
        res = post(json.dumps(sample_payload()), {"magic-hour-event-timestamp": str(now())})
        assert res.status_code == 401

    def test_rejects_missing_timestamp(self):
        body = json.dumps(sample_payload())
        res = post(body, {"magic-hour-event-signature": sign(body, now())})
        assert res.status_code == 401

    def test_rejects_mismatched_signature(self):
        res = post(
            json.dumps(sample_payload()),
            {"magic-hour-event-signature": "a" * 64, "magic-hour-event-timestamp": str(now())},
        )
        assert res.status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(sample_payload())
        ts = now()
        res = post(
            body,
            {
                "magic-hour-event-signature": sign(body, ts, "whsec_other_secret"),
                "magic-hour-event-timestamp": str(ts),
            },
        )
        assert res.status_code == 401

    def test_rejects_secret_without_whsec_prefix(self):
        body = json.dumps(sample_payload())
        ts = now()
        res = post(
            body,
            {
                "magic-hour-event-signature": sign(body, ts, SECRET.replace("whsec_", "")),
                "magic-hour-event-timestamp": str(ts),
            },
        )
        assert res.status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(sample_payload())
        ts = now()
        res = post(
            body.replace("450", "1"),
            {"magic-hour-event-signature": sign(body, ts), "magic-hour-event-timestamp": str(ts)},
        )
        assert res.status_code == 401

    def test_rejects_tampered_timestamp(self):
        body = json.dumps(sample_payload())
        res = post(
            body,
            {"magic-hour-event-signature": sign(body, 1729314984), "magic-hour-event-timestamp": "1729314985"},
        )
        assert res.status_code == 401

    @pytest.mark.parametrize(
        "signature",
        ["abcdef", "a" * 65, "z" * 64, "sha256=" + "a" * 64, "a" * 64 + "\n"],
        ids=["too-short", "too-long", "non-hex", "prefixed", "trailing-newline"],
    )
    def test_rejects_malformed_signature(self, signature):
        res = post(
            json.dumps(sample_payload()),
            {"magic-hour-event-signature": signature, "magic-hour-event-timestamp": str(now())},
        )
        assert res.status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize(
        "event_type",
        [
            "video.started",
            "video.completed",
            "video.errored",
            "image.started",
            "image.completed",
            "image.errored",
            "audio.started",
            "audio.completed",
            "audio.errored",
        ],
    )
    def test_handles_event(self, event_type):
        assert signed_post(sample_payload(event_type)).status_code == 200

    def test_unknown_event_returns_200(self):
        assert signed_post({"type": "video.canceled", "payload": {"id": "x"}}).status_code == 200

    def test_signed_non_json_returns_400(self):
        body = "not json"
        ts = now()
        res = post(
            body,
            {"magic-hour-event-signature": sign(body, ts), "magic-hour-event-timestamp": str(ts)},
        )
        assert res.status_code == 400


class TestVerifyFunction:
    body = json.dumps(sample_payload()).encode()

    def headers_for(self, timestamp):
        return {
            "magic-hour-event-signature": sign(self.body, timestamp),
            "magic-hour-event-timestamp": str(timestamp),
        }

    def test_valid(self):
        assert verify_magic_hour_signature(self.body, self.headers_for(now()), secret=SECRET) is None

    def test_no_secret_configured(self):
        assert verify_magic_hour_signature(self.body, self.headers_for(now()), secret="") is not None

    def test_old_timestamp_only_rejected_with_tolerance(self):
        old = self.headers_for(now() - 3600)
        assert verify_magic_hour_signature(self.body, old, secret=SECRET, tolerance_seconds=0) is None
        assert verify_magic_hour_signature(self.body, old, secret=SECRET, tolerance_seconds=300) is not None

    def test_future_timestamp_rejected_with_tolerance(self):
        future = self.headers_for(now() + 3600)
        assert verify_magic_hour_signature(self.body, future, secret=SECRET, tolerance_seconds=300) is not None

    def test_fresh_timestamp_within_tolerance(self):
        fresh = self.headers_for(now() - 30)
        assert verify_magic_hour_signature(self.body, fresh, secret=SECRET, tolerance_seconds=300) is None

    def test_non_numeric_timestamp_with_tolerance(self):
        headers = self.headers_for("not-a-number")
        assert verify_magic_hour_signature(self.body, headers, secret=SECRET, tolerance_seconds=300) is not None
        assert verify_magic_hour_signature(self.body, headers, secret=SECRET) is None
