import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

# Upload-Post secrets look like whsec_...; the whole string is the HMAC key
SECRET = "whsec_test_secret_key_123"


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("UPLOAD_POST_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS", raising=False)


from main import app  # noqa: E402

client = TestClient(app)


def now_ts() -> str:
    return str(int(time.time()))


def digest(body: bytes, timestamp: str, secret: str = SECRET) -> str:
    signed = b"".join([timestamp.encode("latin-1"), b".", body])
    return hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()


def send(body: bytes, timestamp: str | None = None, signature="auto", content_type="application/json"):
    timestamp = timestamp or now_ts()
    headers = {"Content-Type": content_type, "X-Upload-Post-Timestamp": timestamp}
    if signature == "auto":
        signature = f"sha256={digest(body, timestamp)}"
    if signature is not None:
        headers["X-Upload-Post-Signature"] = signature
    return client.post("/webhooks/upload-post", content=body, headers=headers)


def j(obj) -> bytes:
    return json.dumps(obj).encode()


# Payloads follow the documented samples
COMMENT = j({
    "event": "comment_received",
    "user_email": "user@example.com",
    "profile_username": "my-profile",
    "platform": "instagram",
    "account_id": "17841461478253980",
    "comment": {"id": "17900000000000001", "text": "POST", "parent_id": None,
                "from": {"id": "17841400000000002", "username": "a_follower"}},
    "post": {"id": "17900000000000003", "media_product_type": "REELS"},
    "created_at": "2026-10-20T12:00:00.000000",
})
CONNECTED = j({
    "event": "social_account_connected", "user_email": "user@example.com", "platform": "instagram",
    "account_name": "my_instagram_handle", "status": "connected", "profile_username": "your_profile_username",
    "created_at": "2024-03-15T14:30:00.000000",
})
DISCONNECTED = j({
    "event": "social_account_disconnected", "user_email": "user@example.com", "platform": "tiktok",
    "account_name": "my_tiktok_handle", "status": "disconnected", "profile_username": "your_profile_username",
    "reason": "manual_disconnect", "created_at": "2024-03-15T14:30:00.000000",
})
REAUTH = j({
    "event": "social_account_reauth_required", "user_email": "user@example.com", "platform": "youtube",
    "account_name": "UCxxxxxxxxx", "status": "reauth_required", "reason": "token_refresh_threshold_exceeded",
    "created_at": "2024-03-15T14:30:00.000000",
})
# upload_completed is not in the documented samples; only `event` and `user_email` are asserted
UPLOADED = j({"event": "upload_completed", "user_email": "user@example.com"})


@pytest.mark.parametrize("body", [COMMENT, CONNECTED, DISCONNECTED, REAUTH, UPLOADED])
def test_accepts_signed_events(body):
    res = send(body)
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_logs_unhandled_events(capsys):
    res = send(j({"event": "something_new"}))
    assert res.status_code == 200
    assert "Unhandled event: something_new" in capsys.readouterr().out


def test_accepts_bare_digest():
    ts = now_ts()
    assert send(CONNECTED, ts, digest(CONNECTED, ts)).status_code == 200


def test_accepts_uppercase_hex():
    ts = now_ts()
    assert send(CONNECTED, ts, f"sha256={digest(CONNECTED, ts).upper()}").status_code == 200


def test_verifies_exact_bytes_for_any_content_type():
    body = json.dumps({"event": "comment_received", "comment": {"text": "héllo 🎉"}}, ensure_ascii=False).encode()
    assert send(body, content_type="text/plain").status_code == 200


def test_whole_whsec_secret_is_the_key():
    ts = now_ts()
    stripped = SECRET[len("whsec_"):]
    decoded = base64.b64decode(stripped + "=" * (-len(stripped) % 4)).decode("latin-1")
    assert send(CONNECTED, ts, f"sha256={digest(CONNECTED, ts, stripped)}").status_code == 401
    assert send(CONNECTED, ts, f"sha256={digest(CONNECTED, ts, decoded)}").status_code == 401


def test_rejects_missing_signature():
    assert send(CONNECTED, signature=None).status_code == 401


def test_rejects_empty_signature():
    assert send(CONNECTED, signature="").status_code == 401


def test_rejects_missing_timestamp():
    res = client.post(
        "/webhooks/upload-post",
        content=CONNECTED,
        headers={"Content-Type": "application/json", "X-Upload-Post-Signature": f"sha256={digest(CONNECTED, now_ts())}"},
    )
    assert res.status_code == 401


@pytest.mark.parametrize("signature", ["sha256=abc123", "sha256=" + "z" * 64, "sha256=" + "a" * 66, "sha256="])
def test_rejects_malformed_signature(signature):
    assert send(CONNECTED, signature=signature).status_code == 401


def test_rejects_trailing_newline_in_digest():
    ts = now_ts()
    assert send(CONNECTED, ts, f"sha256={digest(CONNECTED, ts)}\n").status_code == 401


def test_rejects_wrong_secret():
    ts = now_ts()
    assert send(CONNECTED, ts, f"sha256={digest(CONNECTED, ts, 'whsec_other')}").status_code == 401


def test_rejects_tampered_body():
    ts = now_ts()
    headers = {
        "Content-Type": "application/json",
        "X-Upload-Post-Timestamp": ts,
        "X-Upload-Post-Signature": f"sha256={digest(CONNECTED, ts)}",
    }
    res = client.post("/webhooks/upload-post", content=CONNECTED.replace(b"instagram", b"tiktok"), headers=headers)
    assert res.status_code == 401


def test_rejects_timestamp_that_was_not_signed():
    ts = now_ts()
    assert send(CONNECTED, str(int(ts) + 1), f"sha256={digest(CONNECTED, ts)}").status_code == 401


def test_returns_400_for_signed_non_json():
    assert send(b"not json").status_code == 400


class TestTimestampTolerance:
    old_ts = str(int(time.time()) - 3600)

    def test_old_timestamps_accepted_by_default(self):
        assert send(CONNECTED, self.old_ts).status_code == 200

    def test_old_timestamps_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert send(CONNECTED, self.old_ts).status_code == 401

    def test_fresh_timestamps_accepted_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert send(CONNECTED).status_code == 200

    def test_zero_means_off(self, monkeypatch):
        monkeypatch.setenv("UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS", "0")
        assert send(CONNECTED, self.old_ts).status_code == 200
