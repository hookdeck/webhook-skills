import hashlib
import hmac
import json
import os
import time
import uuid

from fastapi.testclient import TestClient

# Set test environment variables before importing the app
os.environ["COMMUNITY_WEBHOOK_SECRET"] = "test_community_signature_secret"

from main import (  # noqa: E402
    app,
    parse_signature_header,
    verify_community_signature,
)

client = TestClient(app)

SECRET = os.environ["COMMUNITY_WEBHOOK_SECRET"]


def generate_signature_header(body: bytes, timestamp: str, secret: str) -> str:
    """Generate a valid `community-signature` header for testing.

    Matches Community's algorithm: HMAC-SHA256("{t}.{body}", secret), hex.
    """
    signed_content = timestamp.encode("utf-8") + b"." + body
    digest = hmac.new(
        secret.encode("utf-8"), signed_content, hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def current_timestamp() -> str:
    # Community's `t` is a Unix timestamp in SECONDS
    return str(int(time.time()))


def unique_event_id() -> str:
    return f"evt-{uuid.uuid4()}"


def member_event(event_type: str, **overrides) -> dict:
    member = {
        "active": True,
        "id": "7a3e02ec-ac2b-952a-9fc0-11b93f283de6",
        "timestamp": "2025-01-16T08:33:47.925975Z",
        "client_id": "34e13e8d-241e-52k9-87hf-143322017665",
        "communication_channel": "sms",
        "communication_channel_id": "12126885505",
        "given_name": "John",
        "surname": "Smith",
    }
    member.update(overrides)

    return {
        "id": unique_event_id(),
        "type": event_type,
        "object": "member",
        "created": "2025-01-05T23:59:45.643131Z",
        "api_version": "2024-02-12",
        "data": {"object": member},
    }


def message_event(event_type: str, **overrides) -> dict:
    message = {
        "id": "96c8b483-c16f-4bc3-8f1b-5fe9e1001162",
        "text": "Spotify",
        "media_list": [],
        "outbound_message_type": "not_set",
        "member": {
            "active": True,
            "id": "7a3e02ec-ac2b-952a-9fc0-11b93f283de6",
            "communication_channel": "sms",
            "communication_channel_id": "12126885505",
        },
    }
    message.update(overrides)

    return {
        "id": unique_event_id(),
        "type": event_type,
        "object": "message",
        "created": "2025-01-05T21:31:19.740650Z",
        "api_version": "2024-02-12",
        "data": {"object": message},
    }


def post_event(event: dict, secret: str = SECRET, timestamp: str | None = None):
    body = json.dumps(event).encode("utf-8")
    ts = timestamp or current_timestamp()
    return client.post(
        "/webhooks/community",
        content=body,
        headers={
            "Content-Type": "application/json",
            "community-signature": generate_signature_header(body, ts, secret),
        },
    )


class TestParseSignatureHeader:
    def test_parses_t_and_v1(self):
        assert parse_signature_header("t=1711666033,v1=abc123") == (
            "1711666033",
            "abc123",
        )

    def test_field_order_does_not_matter(self):
        assert parse_signature_header("v1=abc123,t=1711666033") == (
            "1711666033",
            "abc123",
        )

    def test_tolerates_whitespace(self):
        assert parse_signature_header("t=1711666033, v1=abc123") == (
            "1711666033",
            "abc123",
        )

    def test_ignores_unknown_fields(self):
        assert parse_signature_header("t=1711666033,v1=abc123,v0=legacy") == (
            "1711666033",
            "abc123",
        )

    def test_unknown_scheme_version_is_unsupported(self):
        # v2 is not silently accepted
        assert parse_signature_header("t=1711666033,v2=abc123") is None

    def test_missing_timestamp_returns_none(self):
        assert parse_signature_header("v1=abc123") is None


class TestVerifyCommunitySignature:
    def test_valid_signature_returns_true(self):
        body = b'{"type":"member.created"}'
        header = generate_signature_header(body, current_timestamp(), SECRET)

        assert verify_community_signature(body, header, SECRET) is True

    def test_accepts_uppercase_hex_signature(self):
        """Hex is case-insensitive (0xAB == 0xab), so an uppercase digest must still verify."""
        body = b"{}"
        ts = current_timestamp()
        t_part, v_part = generate_signature_header(body, ts, SECRET).split(",")
        upper = f"{t_part},v1={v_part.split('=', 1)[1].upper()}"

        assert verify_community_signature(body, upper, SECRET) is True

    def test_signed_content_includes_the_timestamp(self):
        # HMAC over the body alone must NOT verify
        body = b'{"type":"member.created"}'
        ts = current_timestamp()
        body_only = hmac.new(
            SECRET.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()

        assert (
            verify_community_signature(body, f"t={ts},v1={body_only}", SECRET) is False
        )

    def test_invalid_signature_returns_false(self):
        ts = current_timestamp()
        assert verify_community_signature(b"{}", f"t={ts},v1=deadbeef", SECRET) is False

    def test_missing_signature_header_returns_false(self):
        assert verify_community_signature(b"{}", None, SECRET) is False

    def test_missing_secret_returns_false(self):
        body = b"{}"
        header = generate_signature_header(body, current_timestamp(), SECRET)

        assert verify_community_signature(body, header, None) is False

    def test_tampered_body_returns_false(self):
        original = b'{"type":"member.created"}'
        tampered = b'{"type":"member.deleted"}'
        header = generate_signature_header(original, current_timestamp(), SECRET)

        assert verify_community_signature(tampered, header, SECRET) is False

    def test_tampered_timestamp_returns_false(self):
        body = b"{}"
        ts = current_timestamp()
        header = generate_signature_header(body, ts, SECRET).replace(f"t={ts}", "t=1")

        assert verify_community_signature(body, header, SECRET) is False

    def test_wrong_secret_returns_false(self):
        body = b"{}"
        header = generate_signature_header(body, current_timestamp(), SECRET)

        assert verify_community_signature(body, header, "wrong_secret") is False

    def test_malformed_header_returns_false(self):
        assert verify_community_signature(b"{}", "not-a-signature", SECRET) is False

    def test_short_signature_does_not_raise(self):
        header = f"t={current_timestamp()},v1=short"
        assert verify_community_signature(b"{}", header, SECRET) is False

    def test_utf8_payload_verifies_byte_for_byte(self):
        body = json.dumps({"text": "héllo 👋 emoji"}).encode("utf-8")
        header = generate_signature_header(body, current_timestamp(), SECRET)

        assert verify_community_signature(body, header, SECRET) is True


class TestOptionalStalenessCheck:
    def test_old_timestamp_accepted_when_tolerance_disabled(self):
        body = b"{}"
        old = str(int(time.time()) - 7200)
        header = generate_signature_header(body, old, SECRET)

        assert verify_community_signature(body, header, SECRET, 0) is True

    def test_stale_timestamp_rejected_when_tolerance_set(self):
        body = b"{}"
        old = str(int(time.time()) - 7200)
        header = generate_signature_header(body, old, SECRET)

        assert verify_community_signature(body, header, SECRET, 300) is False

    def test_fresh_timestamp_accepted_when_tolerance_set(self):
        body = b"{}"
        header = generate_signature_header(body, current_timestamp(), SECRET)

        assert verify_community_signature(body, header, SECRET, 300) is True

    def test_non_numeric_timestamp_rejected_when_tolerance_set(self):
        body = b"{}"
        header = generate_signature_header(body, "not-a-number", SECRET)

        assert verify_community_signature(body, header, SECRET, 300) is False


class TestCommunityWebhookEndpoint:
    def test_missing_signature_header_returns_400(self):
        body = json.dumps(member_event("member.created")).encode("utf-8")

        response = client.post(
            "/webhooks/community",
            content=body,
            headers={"Content-Type": "application/json"},
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Missing community-signature header"

    def test_invalid_signature_returns_400(self):
        body = json.dumps(member_event("member.created")).encode("utf-8")

        response = client.post(
            "/webhooks/community",
            content=body,
            headers={
                "Content-Type": "application/json",
                "community-signature": f"t={current_timestamp()},v1=deadbeef",
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_wrong_secret_returns_400(self):
        response = post_event(member_event("member.created"), secret="wrong_secret")
        assert response.status_code == 400

    def test_invalid_json_with_valid_signature_returns_400(self):
        body = b"not valid json"
        ts = current_timestamp()

        response = client.post(
            "/webhooks/community",
            content=body,
            headers={
                "Content-Type": "application/json",
                "community-signature": generate_signature_header(body, ts, SECRET),
            },
        )

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON"

    def test_member_created_returns_200(self):
        response = post_event(member_event("member.created"))

        assert response.status_code == 200
        assert response.text == "OK"

    def test_member_updated_returns_200(self):
        assert post_event(member_event("member.updated")).status_code == 200

    def test_sparse_member_deleted_returns_200(self):
        # member.deleted omits every personal-data field
        event = {
            "id": unique_event_id(),
            "type": "member.deleted",
            "object": "member",
            "created": "2025-01-16T18:00:41.909260Z",
            "api_version": "2024-02-12",
            "data": {
                "object": {
                    "active": False,
                    "id": "e9e98f87-ecd4-453c-9b82-5dd0c61f1cda",
                    "timestamp": "2025-10-07T20:05:41.051488Z",
                    "client_id": "34e13e8d-241e-52k9-87hf-143322017665",
                    "communication_channel": "sms",
                    "communication_channel_id": "",
                }
            },
        }

        assert post_event(event).status_code == 200

    def test_message_inbound_returns_200(self):
        assert post_event(message_event("message.inbound")).status_code == 200

    def test_message_outbound_returns_200(self):
        response = post_event(
            message_event("message.outbound", outbound_message_type="automated")
        )
        assert response.status_code == 200

    def test_unknown_event_type_returns_200(self):
        assert post_event(member_event("member.something_new")).status_code == 200

    def test_data_member_fallback_shape_returns_200(self):
        event = {
            "id": unique_event_id(),
            "type": "member.created",
            "object": "member",
            "created": "2025-01-05T23:59:45.643131Z",
            "api_version": "2024-02-12",
            "data": {
                "member": {
                    "active": True,
                    "id": "7a3e02ec-ac2b-952a-9fc0-11b93f283de6",
                    "communication_channel": "sms",
                }
            },
        }

        assert post_event(event).status_code == 200

    def test_duplicate_delivery_is_acknowledged(self):
        # Community delivers at-least-once; a repeat must still return 2xx
        event = member_event("member.created")

        first = post_event(event)
        second = post_event(event)

        assert first.status_code == 200
        assert second.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
