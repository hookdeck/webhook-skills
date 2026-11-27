# Generated with: ordinal-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# A test secret in Ordinal's format: "whsec_" + base64(key bytes).
SECRET = "whsec_" + base64.b64encode(b"ordinal-test-signing-key-0123456789").decode()
os.environ["ORDINAL_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

client = TestClient(main.app)


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign per Standard Webhooks: base64(HMAC-SHA256(key, f"{id}.{ts}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(timestamp if timestamp is not None else int(time.time()))
    return {
        "content-type": "application/json",
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body, headers):
    return client.post("/webhooks/ordinal", content=raw_body, headers=headers)


# Payload examples from Ordinal's per-event pages.
POST_PUBLISHED = json.loads(r"""{
  "type": "post.published",
  "data": {
    "post": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Q4 Product Launch Announcement",
      "channel": "LinkedIn",
      "campaign": {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "name": "Launch 2025",
        "startDate": "2025-01-01",
        "endDate": "2025-12-31"
      },
      "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001",
      "postUrl": "https://www.linkedin.com/feed/update/urn:li:share:7123456789012345678",
      "profile": {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Acme Inc",
        "detail": "acme-inc"
      },
      "workspace": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "slug": "acme",
        "name": "Acme Inc"
      },
      "publishedBy": {
        "id": "550e8400-e29b-41d4-a716-446655440010",
        "firstName": "Jane",
        "lastName": "Doe",
        "email": "jane@example.com"
      },
      "publishedAt": "2025-02-26T14:30:00.000Z"
    }
  },
  "createdAt": "2025-02-26T14:30:00.000Z"
}""")

APPROVAL_REQUESTED = json.loads(r"""{
  "type": "post.approval.requested",
  "data": {
    "approval": {
      "post": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "title": "Q4 Product Launch Announcement",
        "url": "https://app.tryordinal.com/acme/posts/550e8400-e29b-41d4-a716-446655440001"
      },
      "campaign": {
        "id": "550e8400-e29b-41d4-a716-446655440003",
        "name": "Launch 2025",
        "startDate": "2025-01-01",
        "endDate": "2025-12-31"
      },
      "workspace": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "slug": "acme",
        "name": "Acme Inc"
      },
      "createdApprovals": [
        {
          "id": "550e8400-e29b-41d4-a716-446655440700",
          "isBlocking": true,
          "message": "Please review before we publish.",
          "dueDate": "2025-02-28T17:00:00.000Z",
          "createdAt": "2025-02-26T14:00:00.000Z",
          "status": "Requested",
          "user": {
            "id": "550e8400-e29b-41d4-a716-446655440020",
            "firstName": "Alex",
            "lastName": "Rivera",
            "email": "alex@example.com"
          },
          "requestedBy": {
            "id": "550e8400-e29b-41d4-a716-446655440010",
            "firstName": "Jane",
            "lastName": "Doe",
            "email": "jane@example.com"
          }
        }
      ],
      "existingApprovals": []
    }
  },
  "createdAt": "2025-02-26T14:00:00.000Z"
}""")


@pytest.fixture(autouse=True)
def reset_env():
    os.environ["ORDINAL_WEBHOOK_SECRET"] = SECRET
    main.processed_event_ids.clear()
    yield


def test_accepts_post_published():
    body = json.dumps(POST_PUBLISHED)
    res = post(body, signed_headers(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_post_approval_requested():
    body = json.dumps(APPROVAL_REQUESTED)
    res = post(body, signed_headers(body))
    assert res.status_code == 200


def test_accepts_either_signature_during_rotation():
    body = json.dumps(POST_PUBLISHED)
    ts = str(int(time.time()))
    old = "whsec_" + base64.b64encode(b"ordinal-old-signing-key-0123456789").decode()
    signature = f"{sign(body, 'msg_rotation', ts, old)} {sign(body, 'msg_rotation', ts)}"
    res = post(body, signed_headers(body, msg_id="msg_rotation", timestamp=ts, signature=signature))
    assert res.status_code == 200


def test_repeated_webhook_id_is_acknowledged_once():
    body = json.dumps(POST_PUBLISHED)
    headers = signed_headers(body, msg_id="msg_duplicate")
    assert post(body, headers).status_code == 200
    res = post(body, headers)
    assert res.json() == {"received": True, "duplicate": True}


def test_rejects_changed_body():
    body = json.dumps(POST_PUBLISHED)
    headers = signed_headers(body)
    assert post(body.replace("LinkedIn", "X"), headers).status_code == 400


def test_rejects_other_secret():
    body = json.dumps(POST_PUBLISHED)
    other = "whsec_" + base64.b64encode(b"some-other-signing-key-0123456789").decode()
    assert post(body, signed_headers(body, secret=other)).status_code == 400


def test_rejects_old_timestamp():
    body = json.dumps(POST_PUBLISHED)
    assert post(body, signed_headers(body, timestamp=int(time.time()) - 600)).status_code == 400


def test_rejects_missing_headers():
    body = json.dumps(POST_PUBLISHED)
    assert post(body, {"content-type": "application/json"}).status_code == 400


def test_fails_closed_without_secret():
    del os.environ["ORDINAL_WEBHOOK_SECRET"]
    body = json.dumps(POST_PUBLISHED)
    assert post(body, signed_headers(body)).status_code == 500


@pytest.mark.parametrize(
    "event_type,key",
    [
        ("social_profile.reconnect_needed", "profile"),
        ("post.published", "post"),
        ("post.inline_comment.created", "comment"),
        ("campaign.approval.approved", "approval"),
        ("invite.accepted", "invite"),
        ("linkedin.monitoring.comment.deleted", "comment"),
        ("linkedin.monitoring.mention.created", "mention"),
    ],
)
def test_resource_key_for(event_type, key):
    assert main.resource_key_for(event_type) == key
