# Generated with: webiny-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# Webiny secrets are admin-entered free text; the HMAC key is their raw UTF-8 bytes.
SECRET = "my-webiny-signing-secret"
os.environ["WEBINY_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_webiny_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, msg_id: str, timestamp, secret: str = SECRET) -> str:
    """Sign like Webiny: base64(HMAC-SHA256(key, f"{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[6:]) if secret.startswith("whsec_") else secret.encode()
    return base64.b64encode(
        hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    ).decode()


ENVELOPE = {
    "id": "task-1",
    "event": "cms.entry.published",
    "timestamp": "2026-10-26T10:00:00.000Z",
    "webhookId": "wh-1",
    "deliveryId": "del-1",
    "tenant": "root",
    "data": {"entryId": "e1"},
}
BODY = json.dumps(ENVELOPE)


def headers_for(body, prefix="webhook", msg_id=None, timestamp=None, secret=SECRET,
                signature=None, content_type="application/json"):
    msg_id = msg_id or f"msg_{uuid.uuid4()}"
    ts = int(time.time()) if timestamp is None else timestamp
    return {
        "content-type": content_type,
        f"{prefix}-id": msg_id,
        f"{prefix}-timestamp": str(ts),
        f"{prefix}-signature": signature or f"v1,{sign(body, msg_id, ts, secret)}",
    }


def post(body, headers):
    return client.post("/webhooks/webiny", content=body, headers=headers)


@pytest.fixture(autouse=True)
def reset_env():
    os.environ["WEBINY_WEBHOOK_SECRET"] = SECRET
    os.environ.pop("WEBINY_WEBHOOK_TOLERANCE_SECONDS", None)
    yield


def test_accepts_valid_delivery():
    res = post(BODY, headers_for(BODY))
    assert res.status_code == 200
    assert res.json()["received"] is True


def test_accepts_non_json_content_type():
    assert post(BODY, headers_for(BODY, content_type="text/plain")).status_code == 200


def test_accepts_svix_prefixed_headers():
    assert post(BODY, headers_for(BODY, prefix="svix")).status_code == 200


def test_accepts_whsec_secret_as_base64():
    whsec = "whsec_" + base64.b64encode(b"another-key-bytes").decode()
    os.environ["WEBINY_WEBHOOK_SECRET"] = whsec
    assert post(BODY, headers_for(BODY, secret=whsec)).status_code == 200


def test_rejects_signature_from_base64_decoded_free_text_secret():
    msg_id, ts = "x", int(time.time())
    try:
        wrong_key = base64.b64decode(SECRET)
    except ValueError:
        wrong_key = SECRET.encode()[:-1]
    wrong = base64.b64encode(
        hmac.new(wrong_key, f"{msg_id}.{ts}.{BODY}".encode(), hashlib.sha256).digest()
    ).decode()
    res = post(BODY, headers_for(BODY, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
    assert res.status_code == 400


def test_accepts_any_matching_v1_entry_and_ignores_other_versions():
    msg_id, ts = "msg_multi", int(time.time())
    good = sign(BODY, msg_id, ts)
    bad = base64.b64encode(b"bad").decode()
    signature = f"v1a,{good} v1,{bad} v1,{good}"
    assert post(BODY, headers_for(BODY, msg_id=msg_id, timestamp=ts, signature=signature)).status_code == 200


def test_rejects_non_v1_only_signature():
    msg_id, ts = "msg_v1a", int(time.time())
    sig = f"v1a,{sign(BODY, msg_id, ts)}"
    assert post(BODY, headers_for(BODY, msg_id=msg_id, timestamp=ts, signature=sig)).status_code == 400


def test_rejects_tampered_body():
    headers = headers_for(BODY)
    tampered = json.dumps({**ENVELOPE, "data": {"entryId": "evil"}})
    assert post(tampered, headers).status_code == 400


def test_rejects_other_secret():
    assert post(BODY, headers_for(BODY, secret="someone-elses-secret")).status_code == 400


def test_rejects_missing_headers():
    assert post(BODY, {"content-type": "application/json"}).status_code == 400


@pytest.mark.parametrize("bad", ["1.5", "-5", "0", "12abc", "0123"])
def test_rejects_non_integer_timestamp(bad):
    sig = f"v1,{sign(BODY, 'msg_bad_ts', bad)}"
    assert post(BODY, headers_for(BODY, msg_id="msg_bad_ts", timestamp=bad, signature=sig)).status_code == 400


def test_accepts_old_timestamp_by_default():
    assert post(BODY, headers_for(BODY, timestamp=int(time.time()) - 86400)).status_code == 200


def test_rejects_old_timestamp_when_tolerance_set():
    os.environ["WEBINY_WEBHOOK_TOLERANCE_SECONDS"] = "300"
    assert post(BODY, headers_for(BODY, timestamp=int(time.time()) - 3600)).status_code == 400


def test_acknowledges_retry_as_duplicate():
    headers = headers_for(BODY, msg_id="msg_dupe")
    assert post(BODY, headers).status_code == 200
    again = post(BODY, headers)
    assert again.status_code == 200
    assert again.json()["duplicate"] is True


def test_fails_closed_without_secret():
    del os.environ["WEBINY_WEBHOOK_SECRET"]
    assert post(BODY, headers_for(BODY)).status_code == 500


def test_never_verifies_with_empty_key():
    headers = headers_for(BODY)
    assert verify_webiny_webhook(BODY.encode(), headers, "whsec_")[0] is False
    assert verify_webiny_webhook(BODY.encode(), headers, "")[0] is False


def test_rejects_invalid_json_with_valid_signature():
    bad = "not json"
    assert post(bad, headers_for(bad)).status_code == 400
