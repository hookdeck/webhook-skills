# Generated with: sentry-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Sentry FastAPI webhook receiver.

Signatures here are generated with the same algorithm Sentry uses
(SentryApp.build_signature): HMAC-SHA256 over the RAW body, keyed with the
integration's Client Secret used AS-IS as UTF-8, lowercase hex.
"""

import hashlib
import hmac
import json
import os
import time
import uuid

import pytest
from fastapi.testclient import TestClient

# A Sentry Client Secret is a 64-character hex string, used AS-IS (never decoded).
CLIENT_SECRET = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90"

os.environ["SENTRY_CLIENT_SECRET"] = CLIENT_SECRET
os.environ.pop("SENTRY_WEBHOOK_TOLERANCE_SECONDS", None)

from main import (  # noqa: E402
    app,
    event_token,
    is_timestamp_fresh,
    verify_sentry_signature,
)

client = TestClient(app, raise_server_exceptions=False)


def generate_signature(raw_body, secret: str = CLIENT_SECRET) -> str:
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def sentry_dumps(payload) -> bytes:
    """Serialize the way Sentry does: compact separators, ensure_ascii=True."""
    return json.dumps(payload, separators=(",", ":")).encode("utf-8")


def post_webhook(
    raw_body: bytes,
    resource="issue",
    signature=...,
    header_name="Sentry-Hook-Signature",
    timestamp=...,
):
    headers = {
        "Content-Type": "application/json",
        "Request-ID": uuid.uuid4().hex,
    }
    if resource is not None:
        headers["Sentry-Hook-Resource"] = resource
    if timestamp is not None:
        headers["Sentry-Hook-Timestamp"] = (
            str(int(time.time())) if timestamp is ... else timestamp
        )
    if signature is not None:
        headers[header_name] = (
            generate_signature(raw_body) if signature is ... else signature
        )
    return client.post("/webhooks/sentry", content=raw_body, headers=headers)


# NOTE: no `type`/`event` field -- the resource comes from the header only.
ISSUE_CREATED = {
    "action": "created",
    "installation": {"uuid": "a8e5d37a-696c-4c54-adb5-b3f28d64c7de"},
    "data": {
        "issue": {
            "id": "100",
            "title": "ZeroDivisionError: division by zero",
            "status": "unresolved",
            "substatus": "new",
            "statusDetails": {},
            "issueCategory": "error",
            "issueType": "error",
        }
    },
    "actor": {"type": "application", "id": "sentry", "name": "Sentry"},
}

INSTALLATION_CREATED = {
    "action": "created",
    "actor": {"id": 1, "name": "Meredith Heller", "type": "user"},
    "data": {
        "installation": {
            "status": "pending",
            "organization": {"slug": "test-org"},
            "app": {"uuid": "2ebf071f-28df-4989-aca9-c37c763b278f", "slug": "webhooks-galore"},
            "code": "f3c71b491e3949b6b033ae45312a4fcb",
            "uuid": "a8e5d37a-696c-4c54-adb5-b3f28d64c7de",
        }
    },
    "installation": {"uuid": "a8e5d37a-696c-4c54-adb5-b3f28d64c7de"},
}

# Issue alerts: resource is `event_alert`, NOT `issue_alert`. tags are PAIRS.
EVENT_ALERT_TRIGGERED = {
    "action": "triggered",
    "installation": {"uuid": "a8e5d37a-696c-4c54-adb5-b3f28d64c7de"},
    "data": {
        "event": {
            "issue_id": "100",
            "web_url": "https://sentry.io/organizations/test-org/issues/100/events/d1e1/",
            "tags": [["browser", "Chrome 75.0.3770"], ["level", "error"]],
        },
        "triggered_rule": "Very Important Alert Rule!",
    },
    "actor": {"type": "application", "id": "sentry", "name": "Sentry"},
}

# preprod_artifact uses camelCase, and a *_completed action can mean FAILED.
PREPROD_SIZE_FAILED = {
    "action": "size_analysis_completed",
    "installation": {"uuid": "a8e5d37a-696c-4c54-adb5-b3f28d64c7de"},
    "data": {
        "buildId": "build_abc123",
        "projectSlug": "mobile-app",
        "state": "FAILED",
        "errorCode": "ARTIFACT_PROCESSING_ERROR",
        "errorMessage": "Could not unpack the artifact",
    },
    "actor": {"type": "application", "id": "sentry", "name": "Sentry"},
}


@pytest.fixture(autouse=True)
def _env():
    os.environ["SENTRY_CLIENT_SECRET"] = CLIENT_SECRET
    os.environ.pop("SENTRY_WEBHOOK_TOLERANCE_SECONDS", None)
    yield
    os.environ["SENTRY_CLIENT_SECRET"] = CLIENT_SECRET
    os.environ.pop("SENTRY_WEBHOOK_TOLERANCE_SECONDS", None)


# --- verify_sentry_signature (unit) ------------------------------------------

BODY = sentry_dumps(ISSUE_CREATED)


def test_accepts_valid_hook_signature():
    headers = {"sentry-hook-signature": generate_signature(BODY)}
    assert verify_sentry_signature(BODY, headers, CLIENT_SECRET) is True


def test_accepts_str_body_identically_to_bytes():
    headers = {"sentry-hook-signature": generate_signature(BODY)}
    assert verify_sentry_signature(BODY.decode("utf-8"), headers, CLIENT_SECRET) is True


def test_falls_back_to_app_signature():
    headers = {"sentry-app-signature": generate_signature(BODY)}
    assert verify_sentry_signature(BODY, headers, CLIENT_SECRET) is True


def test_rejects_tampered_body():
    headers = {"sentry-hook-signature": generate_signature(BODY)}
    tampered = sentry_dumps({**ISSUE_CREATED, "action": "resolved"})
    assert verify_sentry_signature(tampered, headers, CLIENT_SECRET) is False


def test_rejects_wrong_secret():
    headers = {"sentry-hook-signature": generate_signature(BODY, "b" * 64)}
    assert verify_sentry_signature(BODY, headers, CLIENT_SECRET) is False


def test_rejects_missing_header():
    assert verify_sentry_signature(BODY, {}, CLIENT_SECRET) is False


def test_fails_closed_without_secret():
    headers = {"sentry-hook-signature": generate_signature(BODY)}
    assert verify_sentry_signature(BODY, headers, None) is False
    assert verify_sentry_signature(BODY, headers, "") is False


def test_rejects_base64_digest():
    import base64

    b64 = base64.b64encode(
        hmac.new(CLIENT_SECRET.encode(), BODY, hashlib.sha256).digest()
    ).decode()
    assert verify_sentry_signature(BODY, {"sentry-hook-signature": b64}, CLIENT_SECRET) is False


def test_rejects_timestamp_dot_body_signature():
    wrong = generate_signature(f"{int(time.time())}.".encode() + BODY)
    assert verify_sentry_signature(BODY, {"sentry-hook-signature": wrong}, CLIENT_SECRET) is False


def test_rejects_hex_decoded_secret():
    wrong = hmac.new(bytes.fromhex(CLIENT_SECRET), BODY, hashlib.sha256).hexdigest()
    assert verify_sentry_signature(BODY, {"sentry-hook-signature": wrong}, CLIENT_SECRET) is False


def test_garbage_signature_does_not_raise():
    assert verify_sentry_signature(BODY, {"sentry-hook-signature": "abc"}, CLIENT_SECRET) is False


def test_empty_body_signed_over_empty_string():
    sig = generate_signature(b"")
    assert verify_sentry_signature(b"", {"sentry-hook-signature": sig}, CLIENT_SECRET) is True
    assert verify_sentry_signature(b"{}", {"sentry-hook-signature": sig}, CLIENT_SECRET) is False


def test_reserializing_a_parsed_body_breaks_verification():
    """THE BUG IN SENTRY'S OWN SNIPPET: json.dumps(request.body).

    Sentry signs compact, ASCII-escaped JSON. Re-serializing with json.dumps
    defaults (", " separators) -- or with ensure_ascii=False -- produces
    different bytes and rejects a VALID delivery. Raw bytes always verify.
    """
    payload = {"action": "created", "data": {"issue": {"title": "Café 💥"}}}
    raw = sentry_dumps(payload)
    sig = {"sentry-hook-signature": generate_signature(raw)}

    assert b"\\u00e9" in raw  # Sentry's ensure_ascii=True escaping
    assert verify_sentry_signature(raw, sig, CLIENT_SECRET) is True
    assert verify_sentry_signature(json.dumps(payload), sig, CLIENT_SECRET) is False
    assert (
        verify_sentry_signature(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False), sig, CLIENT_SECRET
        )
        is False
    )


# --- event_token / is_timestamp_fresh (unit) ---------------------------------


def test_event_token_combines_header_and_action():
    assert event_token("issue", "created") == "issue.created"
    assert event_token("event_alert", "triggered") == "event_alert.triggered"
    assert event_token(None, "created") == "unknown.created"
    assert event_token("issue", None) == "issue.unknown"


def test_timestamp_check_is_opt_in():
    assert is_timestamp_fresh("0", None) is True
    assert is_timestamp_fresh("0", 0) is True


def test_timestamp_fresh_and_stale():
    now = int(time.time())
    assert is_timestamp_fresh(str(now), 300) is True
    assert is_timestamp_fresh(str(now - 3600), 300) is False
    # milliseconds mistaken for seconds
    assert is_timestamp_fresh(str(now * 1000), 300) is False


def test_timestamp_absent_or_unparseable_is_accepted():
    assert is_timestamp_fresh(None, 300) is True
    assert is_timestamp_fresh("not-a-number", 300) is True


# --- POST /webhooks/sentry ----------------------------------------------------


@pytest.mark.parametrize(
    "resource,payload",
    [
        ("issue", ISSUE_CREATED),
        ("installation", INSTALLATION_CREATED),
        ("event_alert", EVENT_ALERT_TRIGGERED),
        ("preprod_artifact", PREPROD_SIZE_FAILED),
        ("metric_alert", {**ISSUE_CREATED, "action": "open", "data": {}}),
        ("issue", {**ISSUE_CREATED, "action": "ignored"}),
        ("issue", {**ISSUE_CREATED, "action": "archived"}),
        ("seer", {**ISSUE_CREATED, "action": "pr_created", "data": {"run_id": 1, "group_id": 100}}),
    ],
)
def test_accepts_valid_delivery(resource, payload):
    res = post_webhook(sentry_dumps(payload), resource=resource)
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_app_signature_header():
    res = post_webhook(BODY, header_name="Sentry-App-Signature")
    assert res.status_code == 200


def test_accepts_empty_body():
    # Sentry really sends these; a JSON body parser must not 400 on them.
    res = post_webhook(b"")
    assert res.status_code == 200


def test_accepts_non_ascii_payload():
    raw = sentry_dumps({"action": "created", "data": {"issue": {"id": "1", "title": "Café 💥"}}})
    res = post_webhook(raw)
    assert res.status_code == 200


def test_rejects_tampered_body_401():
    res = post_webhook(
        sentry_dumps({**ISSUE_CREATED, "action": "resolved"}),
        signature=generate_signature(BODY),
    )
    assert res.status_code == 401
    assert res.json()["error"] == "Invalid signature"


def test_rejects_missing_signature_401():
    res = post_webhook(BODY, signature=None)
    assert res.status_code == 401
    assert res.json()["error"] == "Missing signature header"


def test_rejects_garbage_signature_401():
    res = post_webhook(BODY, signature="nope")
    assert res.status_code == 401


def test_rejects_non_ascii_signature_401():
    # Starlette decodes this header byte as latin-1 "\u00e9"; str compare_digest
    # would raise TypeError (500) instead of rejecting cleanly.
    res = client.post(
        "/webhooks/sentry",
        content=BODY,
        headers={
            "Content-Type": "application/json",
            "Sentry-Hook-Resource": "issue",
            "Sentry-Hook-Signature": b"\xe9" * 64,
        },
    )
    assert res.status_code == 401


def test_rejects_invalid_json_400():
    res = post_webhook(b"not json at all")
    assert res.status_code == 400
    assert res.json()["error"] == "Invalid JSON"


def test_verifies_without_resource_header():
    res = post_webhook(BODY, resource=None)
    assert res.status_code == 200


def test_fails_closed_without_secret_500():
    del os.environ["SENTRY_CLIENT_SECRET"]
    res = post_webhook(BODY)
    assert res.status_code == 500
    assert res.json()["error"] == "Webhook client secret not configured"


def test_rejects_stale_timestamp_when_tolerance_set():
    os.environ["SENTRY_WEBHOOK_TOLERANCE_SECONDS"] = "300"
    res = post_webhook(BODY, timestamp=str(int(time.time()) - 3600))
    assert res.status_code == 400
    assert res.json()["error"] == "Stale timestamp"


def test_accepts_stale_timestamp_by_default():
    res = post_webhook(BODY, timestamp="1")
    assert res.status_code == 200


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
