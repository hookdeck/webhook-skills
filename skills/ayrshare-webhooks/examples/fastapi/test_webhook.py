import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing the app
SECRET = "test_ayrshare_signing_secret"
os.environ["AYRSHARE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_ayrshare_signature  # noqa: E402

client = TestClient(app)
HEADER = "X-Authorization-Content-SHA256-V2"


def sign(body: bytes, secret: str = SECRET) -> str:
    """hex(HMAC-SHA256(secret, raw body)), exactly as Ayrshare computes it."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# Payloads based on Ayrshare's documented examples
MESSAGE_EVENT = {'action': 'messages',
 'attachments': [{'type': 'image',
                  'url': 'https://images.ayrshare.com/abc123/whatsapp_image_x9aB2pK7.jpg'}],
 'conversationId': '14155551234',
 'created': '2026-05-18T17:08:41Z',
 'hookId': 'JC6IgqFjvDliTJ8MLqzE',
 'id': 'wamid.HBgLMTQxNTU1NTEyMzQVAgARGBI4OUYxRkExNzE0M0EwQTYwM0EA',
 'message': "Here's the photo you asked for.",
 'platform': 'whatsapp',
 'recipientId': '123456789012345',
 'refId': '9abf1426d6ce9122ef11c72bd62e59807c5cc083',
 'senderDetails': {'id': '14155551234', 'name': 'Jane Customer'},
 'senderId': '14155551234',
 'timeStamp': 1747588121,
 'title': 'Primary Profile',
 'url': 'https://mysite.com/webhook'}

ADS_EVENT = {'action': 'ads',
 'type': 'accountRevoked',
 'platform': 'google',
 'accountId': None,
 'id': 'c4e6a8b0d2f4e6a8c0b2d4f6e8a0c2b4d6f8e0a2c4b6d8f0a2c4e6b8d0f2a4c6',
 'created': '2026-10-21T08:15:00.000Z',
 'hookId': 'c4e6a8b0d2f4e6a8c0b2d4f6e8a0c2b4d6f8e0a2c4b6d8f0a2c4e6b8d0f2a4c7',
 'refId': '9abf1426d6ce9122ef11c72bd62e59807c5cc083',
 'url': 'https://api.myapp.com/Webhook/Ayrshare/Ads'}

SCHEDULED_EVENT = {'action': 'scheduled',
 'created': '2023-01-05T01:18:47Z',
 'code': 200,
 'refId': '140b8700bd6ade089b242d845e268fb886130c53',
 'status': 'success',
 'id': 'TBAAAqAMMpoweA9wKHUp',
 'errors': [],
 'postIds': [{'postUrl': 'https://www.facebook.com/102775127855689_361718068618052',
              'platform': 'facebook',
              'status': 'success',
              'id': '102775127855689_361718068618052'}],
 'url': 'https://mysite.com/webhook'}

SOCIAL_EVENT = {'action': 'social',
 'created': '2023-01-05T01:18:47Z',
 'code': 200,
 'hookId': 'TKLc30192HLGw5UeJ46',
 'platform': 'youtube',
 'refId': '140b8700bd6ade089b242d845e268fb886130c53',
 'title': 'User Profile Name',
 'type': 'unlink',
 'url': 'https://mysite.com/webhook'}


def post(body: bytes, header=None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if header is not None:
        headers[HEADER] = header
    return client.post("/webhooks/ayrshare", content=body, headers=headers)


def dumps(event, **kwargs) -> bytes:
    return json.dumps(event, **kwargs).encode()


@pytest.fixture(autouse=True)
def restore_secret():
    os.environ["AYRSHARE_WEBHOOK_SECRET"] = SECRET
    yield
    os.environ["AYRSHARE_WEBHOOK_SECRET"] = SECRET


class TestVerifyAyrshareSignature:
    raw = dumps(MESSAGE_EVENT)
    sig = sign(raw)

    def test_accepts_v1_prefixed(self):
        assert verify_ayrshare_signature(self.raw, f"v1={self.sig}", SECRET)

    def test_accepts_bare_digest(self):
        assert verify_ayrshare_signature(self.raw, self.sig, SECRET)

    def test_accepts_uppercase_hex(self):
        assert verify_ayrshare_signature(self.raw, f"v1={self.sig.upper()}", SECRET)

    def test_accepts_either_entry_during_rotation(self):
        previous = sign(self.raw, "old_secret")
        assert verify_ayrshare_signature(self.raw, f"v1={previous},v1={self.sig}", SECRET)
        assert verify_ayrshare_signature(self.raw, f"v1={self.sig}, v1={previous}", SECRET)

    def test_ignores_entries_with_other_keys(self):
        assert not verify_ayrshare_signature(self.raw, f"v2={self.sig}", SECRET)
        assert verify_ayrshare_signature(self.raw, f"v2={self.sig},v1={self.sig}", SECRET)

    def test_rejects_wrong_secret_tampered_body_and_missing_header(self):
        assert not verify_ayrshare_signature(self.raw, f"v1={sign(self.raw, 'other')}", SECRET)
        assert not verify_ayrshare_signature(b"{}", f"v1={self.sig}", SECRET)
        assert not verify_ayrshare_signature(self.raw, None, SECRET)
        assert not verify_ayrshare_signature(self.raw, "", SECRET)

    def test_rejects_malformed_values_without_raising(self):
        assert not verify_ayrshare_signature(self.raw, "v1=abc", SECRET)
        assert not verify_ayrshare_signature(self.raw, f"v1={self.sig}00", SECRET)
        assert not verify_ayrshare_signature(self.raw, "v1=" + "zz" * 32, SECRET)
        assert not verify_ayrshare_signature(self.raw, "v1=" + "\u00e9" * 64, SECRET)


class TestAyrshareWebhook:
    def test_accepts_signed_messages_event(self):
        body = dumps(MESSAGE_EVENT)
        assert post(body, f"v1={sign(body)}").status_code == 200

    def test_accepts_signed_ads_event(self):
        body = dumps(ADS_EVENT)
        assert post(body, f"v1={sign(body)}").status_code == 200

    @pytest.mark.parametrize("event", [SCHEDULED_EVENT, SOCIAL_EVENT])
    def test_accepts_signed_scheduled_and_social_events(self, event):
        body = dumps(event)
        assert post(body, f"v1={sign(body)}").status_code == 200

    def test_verifies_exact_bytes_any_content_type(self):
        body = dumps({**MESSAGE_EVENT, "message": "Caf\u00e9 \u2615 \u2014 \u00fcn\u00efcode"}, indent=2, ensure_ascii=False)
        assert post(body, f"v1={sign(body)}", "text/plain").status_code == 200

    def test_accepts_rotation_header(self):
        body = dumps(MESSAGE_EVENT)
        header = f"v1={sign(body)},v1={sign(body, 'old_secret')}"
        assert post(body, header).status_code == 200

    def test_accepts_unhandled_action(self):
        body = dumps({"action": "demo", "type": "upgradeWarning", "hookId": "h1"})
        assert post(body, f"v1={sign(body)}").status_code == 200

    def test_rejects_missing_header(self):
        assert post(dumps(MESSAGE_EVENT)).status_code == 401

    def test_rejects_empty_header(self):
        assert post(dumps(MESSAGE_EVENT), "").status_code == 401

    def test_rejects_invalid_signature(self):
        assert post(dumps(MESSAGE_EVENT), "v1=" + "0" * 64).status_code == 401

    def test_rejects_malformed_signature(self):
        assert post(dumps(MESSAGE_EVENT), "v1=not-hex").status_code == 401

    def test_rejects_body_modified_after_signing(self):
        body = dumps(MESSAGE_EVENT)
        assert post(body.replace(b"Jane", b"Mallory"), f"v1={sign(body)}").status_code == 401

    def test_rejects_reserialized_body(self):
        pretty = dumps(MESSAGE_EVENT, indent=2)
        assert post(dumps(MESSAGE_EVENT), f"v1={sign(pretty)}").status_code == 401

    def test_returns_400_for_signed_non_json(self):
        body = b"not json"
        assert post(body, f"v1={sign(body)}", "text/plain").status_code == 400

    def test_returns_400_for_signed_non_object_json(self):
        body = b"[1,2,3]"
        assert post(body, f"v1={sign(body)}").status_code == 400

    @pytest.mark.parametrize(
        "event",
        [
            {"action": "messages", "senderDetails": "x", "message": 42, "hookId": 7},
            {"action": 5},
            {"action": "comments", "from": []},
            {"action": "scheduled", "errors": "x"},
        ],
    )
    def test_ignores_wrong_typed_fields(self, event):
        body = dumps(event)
        assert post(body, f"v1={sign(body)}").status_code == 200

    def test_returns_500_when_secret_not_configured(self):
        del os.environ["AYRSHARE_WEBHOOK_SECRET"]
        body = dumps(MESSAGE_EVENT)
        assert post(body, f"v1={sign(body)}").status_code == 500
