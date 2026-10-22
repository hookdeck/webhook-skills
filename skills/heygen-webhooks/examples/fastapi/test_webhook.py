import base64
import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# HeyGen endpoint secrets look like whsec_... but are used whole as a UTF-8 HMAC key
SECRET = "whsec_k7x9m2testsecretval1"
os.environ["HEYGEN_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: bytes, key: bytes = SECRET.encode()) -> str:
    return hmac.new(key, body, hashlib.sha256).hexdigest()


def event(event_type: str) -> bytes:
    return json.dumps({"event_type": event_type, "event_data": {"video_id": "vid_xyz789"}}).encode()


def post(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["signature"] = signature
    return client.post("/webhooks/heygen", content=body, headers=headers)


@pytest.mark.parametrize(
    "event_type",
    ["avatar_video.success", "avatar_video.fail", "video_translate.success", "video_translate.fail"],
)
def test_valid_signature(event_type):
    body = event(event_type)
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_any_content_type_verifies():
    body = event("avatar_video.success")
    assert post(body, sign(body), content_type="text/plain").status_code == 200


def test_missing_signature():
    assert post(event("avatar_video.success")).status_code == 400


def test_invalid_signature():
    assert post(event("avatar_video.success"), "a" * 64).status_code == 400


def test_short_signature():
    assert post(event("avatar_video.success"), "abc").status_code == 400


def test_tampered_body():
    signed = event("avatar_video.success")
    assert post(event("avatar_video.fail"), sign(signed)).status_code == 400


def test_secret_without_whsec_prefix_is_rejected():
    body = event("avatar_video.success")
    assert post(body, sign(body, SECRET[len("whsec_"):].encode())).status_code == 400


def test_base64_decoded_secret_is_rejected():
    body = event("avatar_video.success")
    key = base64.b64decode(SECRET[len("whsec_"):])
    assert post(body, sign(body, key)).status_code == 400


def test_signed_non_json_body():
    body = b"not json"
    assert post(body, sign(body), content_type="text/plain").status_code == 400


def test_unknown_event_type_acknowledged():
    body = event("instant_avatar.success")
    assert post(body, sign(body)).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
