"""Tests for the LINE webhook handler.

Signatures are generated exactly the way the LINE Platform does:
base64(HMAC-SHA256(channel_secret, raw_body)).
"""

import base64
import hashlib
import hmac
import json
import os

# LINE channel secrets are 32-char hex strings, used verbatim as the HMAC key.
# This one is the sample secret from LINE's "Verify webhook signature" docs.
TEST_SECRET = "8c570fa6dd201bb328f1c1eac23a96d8"
os.environ["LINE_CHANNEL_SECRET"] = TEST_SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_line_signature  # noqa: E402

client = TestClient(app)

DESTINATION = "U8e742f61d673b39c7fff3cecb7536ef0"
DOCS_BODY = b'{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}'
DOCS_SIGNATURE = "GhRKmvmHys4Pi8DxkF4+EayaH0OqtJtaZxgTD9fMDLs="


def sign(raw_body: bytes, secret: str = TEST_SECRET) -> str:
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def post(raw_body: bytes, headers: dict = None):
    return client.post(
        "/webhooks/line",
        content=raw_body,
        headers={"content-type": "application/json; charset=utf-8", **(headers or {})},
    )


def base_event(event_type: str, **extra) -> dict:
    event = {
        "type": event_type,
        "mode": "active",
        "timestamp": 1692251666727,
        "webhookEventId": "01H810YECXQQZ37VAXPF6H9E6T",
        "deliveryContext": {"isRedelivery": False},
        "source": {"type": "user", "userId": "U4af4980629..."},
    }
    event.update(extra)
    return event


MESSAGE_BODY = json.dumps(
    {
        "destination": DESTINATION,
        "events": [
            base_event(
                "message",
                replyToken="38ef843bde154d9b91c21320ffd17a0f",
                message={"type": "text", "id": "468789577898262530", "quoteToken": "q3Plxr4AgKd...", "text": "Chicken, please."},
            )
        ],
    },
    separators=(",", ":"),
).encode("utf-8")


class TestVerifyLineSignature:
    def test_matches_official_docs_vector(self):
        # From https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/
        assert verify_line_signature(DOCS_BODY, DOCS_SIGNATURE, TEST_SECRET) is True

    def test_accepts_generated_signature(self):
        assert verify_line_signature(MESSAGE_BODY, sign(MESSAGE_BODY), TEST_SECRET) is True

    def test_rejects_other_channel_secret(self):
        assert verify_line_signature(MESSAGE_BODY, sign(MESSAGE_BODY, "another_channel_secret"), TEST_SECRET) is False

    def test_rejects_reserialized_body(self):
        reformatted = json.dumps(json.loads(MESSAGE_BODY), indent=2).encode("utf-8")
        assert verify_line_signature(reformatted, sign(MESSAGE_BODY), TEST_SECRET) is False

    def test_rejects_garbage_and_missing_signatures(self):
        assert verify_line_signature(MESSAGE_BODY, "not-a-signature", TEST_SECRET) is False
        assert verify_line_signature(MESSAGE_BODY, "", TEST_SECRET) is False
        assert verify_line_signature(MESSAGE_BODY, None, TEST_SECRET) is False

    def test_rejects_missing_secret(self):
        assert verify_line_signature(MESSAGE_BODY, sign(MESSAGE_BODY), None) is False

    def test_rejects_non_utf8_body(self):
        body = b"\xff\xfe"
        assert verify_line_signature(body, sign(body), TEST_SECRET) is False


class TestLineWebhookEndpoint:
    def test_console_verify_request_returns_200(self):
        response = post(DOCS_BODY, {"x-line-signature": DOCS_SIGNATURE})
        assert response.status_code == 200

    def test_signed_message_event_returns_200(self):
        response = post(MESSAGE_BODY, {"x-line-signature": sign(MESSAGE_BODY)})
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_missing_signature_returns_400(self):
        response = post(MESSAGE_BODY)
        assert response.status_code == 400

    def test_invalid_signature_returns_400(self):
        response = post(MESSAGE_BODY, {"x-line-signature": sign(b'{"tampered":true}')})
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid signature"}

    def test_body_modified_after_signing_returns_400(self):
        signature = sign(MESSAGE_BODY)
        tampered = MESSAGE_BODY.replace(b"Chicken", b"Beef")
        response = post(tampered, {"x-line-signature": signature})
        assert response.status_code == 400

    def test_escapes_newlines_and_emoji_verified_byte_for_byte(self):
        body = (
            '{"destination":"' + DESTINATION + '","events":[{"type":"message","message":'
            '{"type":"text","id":"1","text":"hello\\n test1 \\u3042 🍣"},"mode":"active",'
            '"timestamp":1,"webhookEventId":"01H","deliveryContext":{"isRedelivery":false}}]}'
        ).encode("utf-8")
        response = post(body, {"x-line-signature": sign(body)})
        assert response.status_code == 200

    def test_every_documented_event_type_in_one_batch(self):
        events = [
            base_event("message", replyToken="r", message={"type": "sticker", "id": "1", "packageId": "446", "stickerId": "1988"}),
            base_event("messageEdited", source={"type": "group", "groupId": "Ca56f94637c...", "userId": "U1"}, message={"type": "text", "id": "2", "text": "edited"}),
            base_event("unsend", unsend={"messageId": "325708"}),
            base_event("follow", replyToken="r", follow={"isUnblocked": False}),
            base_event("unfollow"),
            base_event("join", replyToken="r", source={"type": "group", "groupId": "C4af4980629..."}),
            base_event("leave", source={"type": "group", "groupId": "C4af4980629..."}),
            base_event("memberJoined", replyToken="r", source={"type": "group", "groupId": "C1"}, joined={"members": [{"type": "user", "userId": "U4af4980629..."}]}),
            base_event("memberLeft", source={"type": "group", "groupId": "C1"}, left={"members": [{"type": "user", "userId": "U4af4980629..."}]}),
            base_event("postback", replyToken="r", postback={"data": "action=buy&itemid=111", "params": {}}),
            base_event("videoPlayComplete", replyToken="r", videoPlayComplete={"trackingId": "track-id"}),
            base_event("beacon", replyToken="r", beacon={"hwid": "d41d8cd98f", "type": "enter"}),
            base_event("accountLink", replyToken="r", link={"result": "ok", "nonce": "xxxxxxxxxxxxxxx"}),
            base_event("membership", replyToken="r", membership={"type": "joined", "membershipId": 3189}),
            base_event("botSuspended"),
        ]
        body = json.dumps({"destination": DESTINATION, "events": events}).encode("utf-8")
        response = post(body, {"x-line-signature": sign(body)})
        assert response.status_code == 200

    def test_redelivered_event_acknowledged(self):
        body = json.dumps(
            {
                "destination": DESTINATION,
                "events": [base_event("follow", deliveryContext={"isRedelivery": True}, follow={"isUnblocked": True})],
            }
        ).encode("utf-8")
        response = post(body, {"x-line-signature": sign(body)})
        assert response.status_code == 200

    def test_signed_non_json_body_returns_400(self):
        body = b"not json"
        response = post(body, {"x-line-signature": sign(body)})
        assert response.status_code == 400


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
