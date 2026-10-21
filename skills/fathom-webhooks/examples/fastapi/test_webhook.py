import base64
import hashlib
import hmac
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# Fathom secrets are 'whsec_' + base64-encoded key bytes
WEBHOOK_SECRET = "whsec_" + base64.b64encode(b"test_fathom_webhook_secret_key").decode()
os.environ["FATHOM_WEBHOOK_SECRET"] = WEBHOOK_SECRET

from main import app  # noqa: E402

client = TestClient(app)

MEETING = {
    "title": "Quarterly Business Review",
    "meeting_title": "QBR 2025 Q1",
    "recording_id": 123456789,
    "url": "https://fathom.video/xyz123",
    "share_url": "https://fathom.video/share/xyz123",
    "created_at": "2025-03-01T17:01:30Z",
    "transcript_language": "en",
    "shared_with": "single_team",
    "calendar_invitees_domains_type": "one_or_more_external",
    "recorded_by": {
        "name": "Alice Johnson",
        "email": "alice.johnson@acme.com",
        "email_domain": "acme.com",
        "team": "Marketing",
    },
    "calendar_invitees": [],
    "default_summary": {
        "template_name": "general",
        "markdown_formatted": "## Summary\nWe reviewed Q1 OKRs.",
    },
    "action_items": [
        {
            "description": "Email revised proposal to client",
            "user_generated": False,
            "completed": False,
            "recording_timestamp": "00:10:45",
            "recording_playback_url": "https://fathom.video/calls/xyz123?timestamp=645",
            "assignee": {"name": "Alice Johnson", "email": "alice.johnson@acme.com", "team": "Marketing"},
        }
    ],
    "transcript": [
        {
            "speaker": {"display_name": "Alice Johnson"},
            "text": "Let's revisit the budget allocations.",
            "timestamp": "00:05:32",
        }
    ],
}


def sign(body: str, webhook_id: str, timestamp: int, secret: str = WEBHOOK_SECRET) -> str:
    """Sign exactly as Fathom does (Standard Webhooks):
    base64(HMAC-SHA256(base64decode(secret after whsec_), "{id}.{timestamp}.{body}"))
    """
    key = base64.b64decode(secret.split("_")[1])
    digest = hmac.new(key, f"{webhook_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def headers_for(body: str, webhook_id="msg_2x2zwLOcWaRTzsLK8KtbQt1FTk9", timestamp=None, signature=None, secret=WEBHOOK_SECRET):
    timestamp = timestamp or int(time.time())
    return {
        "content-type": "application/json",
        "webhook-id": webhook_id,
        "webhook-timestamp": str(timestamp),
        "webhook-signature": signature or sign(body, webhook_id, timestamp, secret),
    }


@pytest.fixture(autouse=True)
def reset_secret():
    os.environ["FATHOM_WEBHOOK_SECRET"] = WEBHOOK_SECRET
    yield
    os.environ["FATHOM_WEBHOOK_SECRET"] = WEBHOOK_SECRET


def post(body: str, headers: dict):
    return client.post("/webhooks/fathom", content=body, headers=headers)


def test_accepts_correctly_signed_meeting():
    body = json.dumps(MEETING)
    res = post(body, headers_for(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_payload_without_optional_fields():
    minimal = {k: v for k, v in MEETING.items() if k not in ("default_summary", "action_items", "transcript")}
    body = json.dumps(minimal)
    assert post(body, headers_for(body)).status_code == 200


def test_accepts_when_one_of_several_signatures_matches():
    body = json.dumps(MEETING)
    headers = headers_for(body)
    headers["webhook-signature"] = "v1,aW52YWxpZA== " + headers["webhook-signature"]
    assert post(body, headers).status_code == 200


def test_rejects_invalid_signature():
    body = json.dumps(MEETING)
    assert post(body, headers_for(body, signature="v1,aW52YWxpZHNpZ25hdHVyZQ==")).status_code == 400


def test_rejects_signature_from_different_secret():
    body = json.dumps(MEETING)
    other = "whsec_" + base64.b64encode(b"some_other_secret").decode()
    assert post(body, headers_for(body, secret=other)).status_code == 400


def test_rejects_tampered_body():
    body = json.dumps(MEETING)
    headers = headers_for(body)
    tampered = json.dumps({**MEETING, "title": "Tampered"})
    assert post(tampered, headers).status_code == 400


def test_rejects_stale_timestamp():
    body = json.dumps(MEETING)
    stale = int(time.time()) - 600
    assert post(body, headers_for(body, timestamp=stale)).status_code == 400


@pytest.mark.parametrize("header", ["webhook-id", "webhook-timestamp", "webhook-signature"])
def test_rejects_missing_header(header):
    body = json.dumps(MEETING)
    headers = headers_for(body)
    del headers[header]
    assert post(body, headers).status_code == 400


def test_returns_500_without_secret():
    del os.environ["FATHOM_WEBHOOK_SECRET"]
    body = json.dumps(MEETING)
    assert post(body, headers_for(body)).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
