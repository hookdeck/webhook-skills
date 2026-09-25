import base64
import hashlib
import hmac
import json
import os
import urllib.parse

import pytest

# The per-WebHook "HMAC Key" set in Formstack (API field `hmacSecret`). It is an
# arbitrary string with no vendor prefix — Formstack imposes no format on it.
TEST_HMAC_KEY = "fs_test_hmac_key_9f2b41c7"
WRONG_HMAC_KEY = "fs_test_hmac_key_deadbeef"

os.environ["FORMSTACK_HMAC_KEY"] = TEST_HMAC_KEY
os.environ.pop("FORMSTACK_SIGNATURE_HEADER", None)

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_formstack_webhook  # noqa: E402

client = TestClient(app)

# A realistic urlencoded body: the DEFAULT Formstack content type. Note the exact
# escaping (`+` for spaces, `%40` for `@`) and key order — the digest covers these
# exact bytes.
URLENCODED_BODY = (
    "FormID=1234567&UniqueID=9876543210&Name=Jane+Smith"
    "&Email=jane%40example.com&Message=Hello+there"
)

# The same submission as JSON, matching the shape in the v2025 API reference's
# WebhookOpenApiDefinitionDto example.
JSON_BODY = json.dumps(
    {
        "FormID": "1234567",
        "UniqueID": "9876543210",
        "Name": "Jane Smith",
        "Email": "jane@example.com",
        "Message": "Hello there",
    }
)

URLENCODED = "application/x-www-form-urlencoded"


def sign(raw_body, key=TEST_HMAC_KEY):
    """Sign a raw body exactly as Formstack does: HMAC-SHA256, LOWERCASE HEX."""
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    return hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()


def sign_base64(raw_body, key=TEST_HMAC_KEY):
    """The FastSpring encoding, used only to prove we reject it."""
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    return base64.b64encode(
        hmac.new(key.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("ascii")


def post(raw_body, signature=None, content_type=URLENCODED, header_name="X-FS-Signature"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers[header_name] = signature
    return client.post("/webhooks/formstack", content=raw_body, headers=headers)


class TestVerifyFormstackWebhook:
    def test_accepts_valid_hex_digest_over_urlencoded_body(self):
        assert verify_formstack_webhook(
            URLENCODED_BODY.encode(), sign(URLENCODED_BODY), TEST_HMAC_KEY
        )

    def test_accepts_valid_digest_over_json_body(self):
        assert verify_formstack_webhook(JSON_BODY.encode(), sign(JSON_BODY), TEST_HMAC_KEY)

    def test_accepts_sha256_prefixed_digest(self):
        header = f"sha256={sign(URLENCODED_BODY)}"
        assert verify_formstack_webhook(URLENCODED_BODY.encode(), header, TEST_HMAC_KEY)

    def test_strips_prefix_case_insensitively(self):
        header = f"SHA256={sign(URLENCODED_BODY)}"
        assert verify_formstack_webhook(URLENCODED_BODY.encode(), header, TEST_HMAC_KEY)

    def test_accepts_uppercase_hex_digest(self):
        header = sign(URLENCODED_BODY).upper()
        assert verify_formstack_webhook(URLENCODED_BODY.encode(), header, TEST_HMAC_KEY)

    def test_tolerates_surrounding_whitespace(self):
        header = f"  sha256={sign(URLENCODED_BODY)}  "
        assert verify_formstack_webhook(URLENCODED_BODY.encode(), header, TEST_HMAC_KEY)

    def test_rejects_digest_from_a_different_key(self):
        assert not verify_formstack_webhook(
            URLENCODED_BODY.encode(), sign(URLENCODED_BODY, WRONG_HMAC_KEY), TEST_HMAC_KEY
        )

    def test_rejects_digest_over_a_different_body(self):
        assert not verify_formstack_webhook(
            URLENCODED_BODY.encode(), sign("FormID=999"), TEST_HMAC_KEY
        )

    def test_rejects_base64_digest(self):
        # Guards against importing FastSpring's scheme — same header name, base64 digest.
        assert not verify_formstack_webhook(
            URLENCODED_BODY.encode(), sign_base64(URLENCODED_BODY), TEST_HMAC_KEY
        )

    def test_rejects_truncated_digest_without_raising(self):
        truncated = sign(URLENCODED_BODY)[:20]
        assert not verify_formstack_webhook(URLENCODED_BODY.encode(), truncated, TEST_HMAC_KEY)

    def test_rejects_non_ascii_header_without_raising(self):
        # Header values reach the app latin-1 decoded, so a hostile sender can put
        # non-ASCII characters in them. hmac.compare_digest refuses non-ASCII *str*
        # arguments, so comparing as str would turn this into an unhandled 500.
        assert not verify_formstack_webhook(
            URLENCODED_BODY.encode(), "ÿþ", TEST_HMAC_KEY
        )

    # FAIL CLOSED. Signing is optional in Formstack, which makes an "accept when
    # unconfigured" fallback tempting. It must never exist.
    def test_fails_closed_without_a_key(self):
        assert not verify_formstack_webhook(
            URLENCODED_BODY.encode(), sign(URLENCODED_BODY), None
        )
        assert not verify_formstack_webhook(URLENCODED_BODY.encode(), sign(URLENCODED_BODY), "")

    def test_fails_closed_without_a_signature_header(self):
        assert not verify_formstack_webhook(URLENCODED_BODY.encode(), None, TEST_HMAC_KEY)
        assert not verify_formstack_webhook(URLENCODED_BODY.encode(), "", TEST_HMAC_KEY)


class TestRawBodyTrap:
    """The single most likely place a Formstack implementation goes wrong."""

    def test_rejects_digest_over_a_re_encoded_parsed_body(self):
        parsed = dict(urllib.parse.parse_qsl(URLENCODED_BODY))
        # Serializers disagree about how to escape a space: the wire bytes used `+`,
        # and quote() emits `%20`. Same fields, different bytes, different digest.
        re_encoded = urllib.parse.urlencode(parsed, quote_via=urllib.parse.quote)

        assert re_encoded != URLENCODED_BODY
        assert sign(re_encoded) != sign(URLENCODED_BODY)
        assert not verify_formstack_webhook(
            URLENCODED_BODY.encode(), sign(re_encoded), TEST_HMAC_KEY
        )

    def test_rejects_digest_over_a_reordered_body_with_identical_fields(self):
        reordered = (
            "Message=Hello+there&Email=jane%40example.com&Name=Jane+Smith"
            "&UniqueID=9876543210&FormID=1234567"
        )
        assert dict(urllib.parse.parse_qsl(reordered)) == dict(
            urllib.parse.parse_qsl(URLENCODED_BODY)
        )
        assert not verify_formstack_webhook(
            URLENCODED_BODY.encode(), sign(reordered), TEST_HMAC_KEY
        )

    def test_rejects_digest_over_a_re_serialized_json_body(self):
        re_serialized = json.dumps(json.loads(JSON_BODY), indent=2)
        assert not verify_formstack_webhook(
            JSON_BODY.encode(), sign(re_serialized), TEST_HMAC_KEY
        )


class TestWebhookEndpoint:
    def test_accepts_signed_urlencoded_submission(self):
        response = post(URLENCODED_BODY, sign(URLENCODED_BODY))

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_signed_json_submission(self):
        response = post(JSON_BODY, sign(JSON_BODY), "application/json")

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_sha256_prefixed_delivery(self):
        response = post(URLENCODED_BODY, f"sha256={sign(URLENCODED_BODY)}")

        assert response.status_code == 200

    def test_accepts_payload_with_numeric_field_id_keys(self):
        # postDataFieldKeys: field_ids — the format you should use when labels may repeat.
        body = (
            "FormID=1234567&UniqueID=9876543211&12345678=Jane+Smith"
            "&12345679=jane%40example.com"
        )
        response = post(body, sign(body))

        assert response.status_code == 200

    def test_accepts_submission_without_unique_id(self):
        # Idempotency falls back to a hash of the raw body.
        body = "FormID=1234567&Name=Jane+Smith"
        response = post(body, sign(body))

        assert response.status_code == 200

    def test_accepts_submission_from_unrecognised_form(self):
        # No event types exist; the discriminator is FormID, and an unknown form must
        # still get a 2xx.
        body = "FormID=555&UniqueID=1&Anything=Goes"
        response = post(body, sign(body))

        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_rejects_invalid_signature(self):
        response = post(URLENCODED_BODY, sign(URLENCODED_BODY, WRONG_HMAC_KEY))

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_rejects_missing_signature_header(self):
        response = post(URLENCODED_BODY)

        assert response.status_code == 400
        assert response.json()["detail"] == "Missing signature header"

    def test_rejects_tampered_body(self):
        tampered = URLENCODED_BODY.replace("Jane+Smith", "Mallory")
        response = post(tampered, sign(URLENCODED_BODY))

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_rejects_base64_digest(self):
        response = post(URLENCODED_BODY, sign_base64(URLENCODED_BODY))

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_rejects_invalid_json_that_is_correctly_signed(self):
        body = "not json at all"
        response = post(body, sign(body), "application/json")

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid payload"

    def test_rejects_unsupported_content_type(self):
        body = "plain text body"
        response = post(body, sign(body), "text/plain")

        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid payload"


class TestFailClosedConfiguration:
    @pytest.fixture(autouse=True)
    def restore_key(self):
        yield
        os.environ["FORMSTACK_HMAC_KEY"] = TEST_HMAC_KEY

    def test_returns_500_when_key_unset(self):
        del os.environ["FORMSTACK_HMAC_KEY"]

        response = post(URLENCODED_BODY, sign(URLENCODED_BODY))

        assert response.status_code == 500
        assert response.json()["detail"] == "Webhook secret not configured"

    def test_returns_500_when_key_empty(self):
        os.environ["FORMSTACK_HMAC_KEY"] = ""

        response = post(URLENCODED_BODY, sign(URLENCODED_BODY))

        assert response.status_code == 500
        assert response.json()["detail"] == "Webhook secret not configured"


class TestCustomHmacHeader:
    """The WebHook's "Custom HMAC Header" field overrides X-FS-Signature."""

    @pytest.fixture(autouse=True)
    def clear_header_override(self):
        yield
        os.environ.pop("FORMSTACK_SIGNATURE_HEADER", None)

    def test_reads_digest_from_configured_header(self):
        os.environ["FORMSTACK_SIGNATURE_HEADER"] = "x-my-custom-sig"

        response = post(
            URLENCODED_BODY, sign(URLENCODED_BODY), header_name="X-My-Custom-Sig"
        )

        assert response.status_code == 200

    def test_ignores_default_header_once_custom_is_configured(self):
        os.environ["FORMSTACK_SIGNATURE_HEADER"] = "x-my-custom-sig"

        response = post(URLENCODED_BODY, sign(URLENCODED_BODY))

        assert response.status_code == 400
        assert response.json()["detail"] == "Missing signature header"

    def test_is_case_insensitive_about_configured_name(self):
        os.environ["FORMSTACK_SIGNATURE_HEADER"] = "X-My-Custom-Sig"

        response = post(
            URLENCODED_BODY, sign(URLENCODED_BODY), header_name="x-my-custom-sig"
        )

        assert response.status_code == 200


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


# Two real deliveries captured from a Formstack Forms WebHook on 2026-09-25, byte for
# byte. These are the only vectors here that Formstack signed rather than this suite:
# they pin the digest format (HMAC-SHA256, lowercase hex, `sha256=`-prefixed) to what
# Formstack actually sends. The HMAC Key was `test` for the first and `test1` for the
# second, while the Shared Secret stayed `test` -- which is why `HandshakeKey=test`
# appears in both bodies.
CAPTURED_DELIVERIES = [
    (
        "test",
        b"FormID=6606394&UniqueID=1500877919&HandshakeKey=test",
        "sha256=54bc5cf9f57b9a1083c7e53d734cb0586933146ba6b2150e888a827dfb468ea7",
    ),
    (
        "test1",
        b"FormID=6606394&UniqueID=1500878955&HandshakeKey=test",
        "sha256=30dff7f180b6d69eab397a5d51719474df490b730514c253e8b5832d3b51b970",
    ),
]


@pytest.mark.parametrize("hmac_key,body,signature", CAPTURED_DELIVERIES)
def test_verifies_real_captured_delivery(hmac_key, body, signature):
    assert verify_formstack_webhook(body, signature, hmac_key) is True


def test_rejects_second_captured_delivery_under_first_key():
    first_key = CAPTURED_DELIVERIES[0][0]
    _, body, signature = CAPTURED_DELIVERIES[1]
    assert verify_formstack_webhook(body, signature, first_key) is False


def test_accepts_captured_delivery_end_to_end(monkeypatch):
    hmac_key, body, signature = CAPTURED_DELIVERIES[1]
    monkeypatch.setenv("FORMSTACK_HMAC_KEY", hmac_key)
    res = post(body, signature, content_type="application/x-www-form-urlencoded; charset=utf-8")
    assert res.status_code == 200
    assert res.json() == {"received": True}
