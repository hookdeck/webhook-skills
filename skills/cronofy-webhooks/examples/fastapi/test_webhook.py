import base64
import hashlib
import hmac
import json
import os

import pytest

# Cronofy's own published test vector secret. Client secrets are prefixed `CRN_`.
# This IS the HMAC key — Cronofy issues no separate webhook signing secret.
TEST_SECRET = "CRN_NggYusqPGLxwjw5FHOJYOqSrTPNXy8WQf14OID"
# Cronofy's second published secret, used to exercise secret rotation.
ROTATED_SECRET = "CRN_nGlYDFXwfSXgB9rvGNBJyfE454GGPtWIbNuPwr"

os.environ["CRONOFY_CLIENT_SECRET"] = TEST_SECRET
os.environ["CRONOFY_DATA_CENTER_URL"] = "https://api.cronofy.com"

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_cronofy_webhook  # noqa: E402

client = TestClient(app)

# https://docs.cronofy.com/api-reference/authorization/webhook-authentication/
WELL_KNOWN_BODY = '{"example":"well-known"}'
DIGEST_1 = "5DxentQi5YSXODEzTVv06sRwJ3pULIz1KrYv20qxEK0="
DIGEST_2 = "BmQmWVuZ70ILWjr1CAt5oC7YOolgnku4WZtlrKfx/6k="


def sign(raw_body, secret=TEST_SECRET):
    """Sign a raw body exactly as Cronofy does: HMAC-SHA256, base64."""
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    return base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("ascii")


def build_body(notification_type, notification=None, channel=None):
    """Build a notification body. Serialize once — the HMAC covers these exact bytes."""
    payload = {
        "notification": {"type": notification_type, **(notification or {})},
        "channel": {
            "channel_id": "chn_54cf7c7cb4ad4c1027000001",
            "callback_url": "https://example.com/webhooks/cronofy",
            **(channel or {}),
        },
    }
    return json.dumps(payload)


def post(raw_body, hmac_header=None):
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if hmac_header is not None:
        headers["Cronofy-HMAC-SHA256"] = hmac_header
    return client.post("/webhooks/cronofy", content=raw_body, headers=headers)


class TestPublishedVectors:
    """Cronofy publishes these digests; reproduce them exactly."""

    def test_reproduces_single_secret_digest(self):
        assert sign(WELL_KNOWN_BODY, TEST_SECRET) == DIGEST_1

    def test_reproduces_second_secret_digest(self):
        assert sign(WELL_KNOWN_BODY, ROTATED_SECRET) == DIGEST_2

    def test_uses_standard_base64_not_base64url(self):
        # The published digest contains "/" — base64url would render it as "_".
        assert "/" in DIGEST_2
        assert "_" not in sign(WELL_KNOWN_BODY, ROTATED_SECRET)

    def test_verifies_docs_multi_secret_header_verbatim(self):
        header = f"{DIGEST_1},{DIGEST_2}"
        assert verify_cronofy_webhook(WELL_KNOWN_BODY.encode(), header, TEST_SECRET)
        assert verify_cronofy_webhook(WELL_KNOWN_BODY.encode(), header, ROTATED_SECRET)


class TestVerifyCronofyWebhook:
    body = build_body("change", {"changes_since": "2026-08-26T09:24:16Z"})

    def test_accepts_valid_single_signature(self):
        assert verify_cronofy_webhook(self.body.encode(), sign(self.body), TEST_SECRET)

    def test_accepts_when_our_secret_is_second_in_rotation_list(self):
        header = f"{sign(self.body, ROTATED_SECRET)},{sign(self.body, TEST_SECRET)}"
        assert verify_cronofy_webhook(self.body.encode(), header, TEST_SECRET)

    def test_accepts_when_our_secret_is_first_in_rotation_list(self):
        header = f"{sign(self.body, TEST_SECRET)},{sign(self.body, ROTATED_SECRET)}"
        assert verify_cronofy_webhook(self.body.encode(), header, TEST_SECRET)

    def test_tolerates_whitespace_around_list_elements(self):
        header = f" {sign(self.body, ROTATED_SECRET)} , {sign(self.body, TEST_SECRET)} "
        assert verify_cronofy_webhook(self.body.encode(), header, TEST_SECRET)

    def test_rejects_list_of_only_other_secrets(self):
        header = f"{sign(self.body, ROTATED_SECRET)},{sign(self.body, 'CRN_someoneelse')}"
        assert not verify_cronofy_webhook(self.body.encode(), header, TEST_SECRET)

    def test_rejects_header_of_only_separators(self):
        # Empty candidates are filtered out.
        for header in (" , ", "", ",,,"):
            assert not verify_cronofy_webhook(self.body.encode(), header, TEST_SECRET)

    def test_rejects_non_ascii_header_without_raising(self):
        # Header values reach the app latin-1 decoded, so a hostile sender can put
        # non-ASCII characters in them. hmac.compare_digest refuses non-ASCII *str*
        # arguments, so comparing as str would turn this into an unhandled 500
        # instead of a clean rejection.
        assert not verify_cronofy_webhook(self.body.encode(), "\u00ff\u00fe", TEST_SECRET)

    def test_rejects_signature_over_a_different_body(self):
        assert not verify_cronofy_webhook(
            self.body.encode(), sign('{"other":true}'), TEST_SECRET
        )

    def test_rejects_truncated_signature_without_raising(self):
        truncated = sign(self.body)[:20]
        assert not verify_cronofy_webhook(self.body.encode(), truncated, TEST_SECRET)

    def test_rejects_missing_header_or_secret(self):
        assert not verify_cronofy_webhook(self.body.encode(), "", TEST_SECRET)
        assert not verify_cronofy_webhook(self.body.encode(), None, TEST_SECRET)
        assert not verify_cronofy_webhook(self.body.encode(), sign(self.body), "")

    def test_rejects_base64url_digest(self):
        url_safe = base64.urlsafe_b64encode(
            hmac.new(
                ROTATED_SECRET.encode("utf-8"),
                WELL_KNOWN_BODY.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode("ascii")
        assert not verify_cronofy_webhook(
            WELL_KNOWN_BODY.encode(), url_safe, ROTATED_SECRET
        )

    def test_is_sensitive_to_whitespace_changes_in_body(self):
        # The raw bytes are signed — re-serializing breaks the digest.
        reserialized = json.dumps(json.loads(self.body), indent=2)
        assert not verify_cronofy_webhook(
            reserialized.encode(), sign(self.body), TEST_SECRET
        )


class TestWebhookEndpoint:
    def test_accepts_verification_notification(self):
        body = build_body("verification")
        response = post(body, sign(body))

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_change_notification(self):
        body = build_body(
            "change",
            {"changes_since": "2026-08-26T09:24:16Z"},
            {
                "filters": {
                    "calendar_ids": ["cal_n23kjnwrw2_sakdnawerd3"],
                    "only_managed": False,
                }
            },
        )
        response = post(body, sign(body))

        assert response.status_code == 200
        assert response.json() == {"received": True}
        # The payload carries no events — it's a ping. changes_since drives Read Events.
        assert json.loads(body)["notification"]["changes_since"] == "2026-08-26T09:24:16Z"

    @pytest.mark.parametrize(
        "notification_type",
        [
            "profile_disconnected",
            "conferencing_profile_disconnected",
            "profile_initial_sync_completed",
            "gdpr_requested",
        ],
    )
    def test_accepts_lifecycle_notifications(self, notification_type):
        body = build_body(notification_type)
        response = post(body, sign(body))

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_returns_200_for_unknown_type(self):
        # Cronofy: "your code should be tolerant of others, by ignoring them".
        body = build_body("some_future_type")
        response = post(body, sign(body))

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_delivery_signed_during_secret_rotation(self):
        body = build_body("change", {"changes_since": "2026-08-26T09:24:16Z"})
        header = f"{sign(body, ROTATED_SECRET)},{sign(body, TEST_SECRET)}"
        response = post(body, header)

        assert response.status_code == 200

    def test_rejects_invalid_signature(self):
        body = build_body("change", {"changes_since": "2026-08-26T09:24:16Z"})
        response = post(body, sign(body, "CRN_wrongsecret"))

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_rejects_missing_signature_header(self):
        body = build_body("verification")
        response = post(body)

        assert response.status_code == 400
        assert response.json()["detail"] == "Missing signature header"

    def test_rejects_tampered_body(self):
        original = build_body("verification")
        tampered = build_body("gdpr_requested")
        response = post(tampered, sign(original))

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_rejects_invalid_json_that_is_correctly_signed(self):
        body = "not json at all"
        response = post(body, sign(body))

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON"

    def test_rejects_signed_body_missing_notification_type(self):
        body = json.dumps({"channel": {"channel_id": "chn_1"}})
        response = post(body, sign(body))

        assert response.status_code == 400
        assert response.json()["detail"] == "Missing notification.type"


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
