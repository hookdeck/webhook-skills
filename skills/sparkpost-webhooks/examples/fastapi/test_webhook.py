import base64
import json
import os
import time

import pytest

# Credentials YOUR endpoint defines and SparkPost is configured with. They are
# NOT SparkPost account credentials. These match the API reference's own
# `auth_credentials` example.
TEST_USERNAME = "basicauthuser"
TEST_PASSWORD = "mypassword"

# The documented `auth_request_details.body` example values.
TEST_CLIENT_ID = "CLIENT123"
TEST_CLIENT_SECRET = "9sdfj791d2bsbf"

# The deprecated `auth_token` -> X-MessageSystems-Webhook-Token value.
TEST_LEGACY_TOKEN = "existing-webhook-token"

os.environ["SPARKPOST_WEBHOOK_USERNAME"] = TEST_USERNAME
os.environ["SPARKPOST_WEBHOOK_PASSWORD"] = TEST_PASSWORD
os.environ["SPARKPOST_OAUTH_CLIENT_ID"] = TEST_CLIENT_ID
os.environ["SPARKPOST_OAUTH_CLIENT_SECRET"] = TEST_CLIENT_SECRET
os.environ["SPARKPOST_WEBHOOK_TOKEN"] = TEST_LEGACY_TOKEN

from fastapi.testclient import TestClient  # noqa: E402

from main import (  # noqa: E402
    _set_token,
    app,
    authenticate_request,
    verify_basic_auth,
)

client = TestClient(app)

AUTH_ENV_KEYS = [
    "SPARKPOST_WEBHOOK_USERNAME",
    "SPARKPOST_WEBHOOK_PASSWORD",
    "SPARKPOST_OAUTH_CLIENT_ID",
    "SPARKPOST_OAUTH_CLIENT_SECRET",
    "SPARKPOST_WEBHOOK_TOKEN",
]


def basic(username=TEST_USERNAME, password=TEST_PASSWORD, scheme="Basic"):
    """Build the RFC 7617 header exactly as SparkPost does."""
    encoded = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
    return f"{scheme} {encoded}"


_batch_counter = {"n": 0}


def next_batch_id():
    """Unique batch id per request so the dedupe cache doesn't swallow tests."""
    _batch_counter["n"] += 1
    return f"6f4b3d2a-1e5c-4d7a-9f8b-{_batch_counter['n']:012d}"


def post(body, authorization=None, legacy_token=None, batch_id=-1):
    headers = {"Content-Type": "application/json"}
    if authorization is not None:
        headers["Authorization"] = authorization
    if legacy_token is not None:
        headers["X-MessageSystems-Webhook-Token"] = legacy_token
    resolved_batch_id = next_batch_id() if batch_id == -1 else batch_id
    if resolved_batch_id is not None:
        headers["X-MessageSystems-Batch-ID"] = resolved_batch_id
    content = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/sparkpost", headers=headers, content=content)


# ---------------------------------------------------------------------------
# Real documented payloads, taken from SparkPost's Events Documentation endpoint
# sample values (api.sparkpost.com/api/v1/webhooks/events/documentation).
# Note that numeric-looking fields are STRINGS.
# ---------------------------------------------------------------------------

DELIVERY_BATCH = [
    {
        "msys": {
            "message_event": {
                "type": "delivery",
                "event_id": "92356927693813856",
                "timestamp": "1460989507",
                "message_id": "000443ee14578172be22",
                "transmission_id": "65832150921904138",
                "rcpt_to": "recipient@example.com",
                "raw_rcpt_to": "recipient@example.com",
                "campaign_id": "Example Campaign Name",
                "subaccount_id": "101",
                "customer_id": "1",
                "friendly_from": "sender@example.com",
                "subject": "Summer deals are here!",
                "template_id": "templ-1234",
                "num_retries": "2",
                "queue_time": "12",
                "msg_size": "1337",
                "open_tracking": True,
                "click_tracking": True,
                "rcpt_meta": {"customKey": "customValue"},
                "rcpt_tags": ["male", "US"],
            }
        }
    }
]

BOUNCE_BATCH = [
    {
        "msys": {
            "message_event": {
                "type": "bounce",
                "event_id": "92356927693813856",
                "timestamp": "1460989507",
                "message_id": "000443ee14578172be22",
                "transmission_id": "65832150921904138",
                "rcpt_to": "recipient@example.com",
                "bounce_class": "1",
                "error_code": "554",
                "reason": "MAIL REFUSED - IP (a.b.c.d) is in black list",
                "raw_reason": "MAIL REFUSED - IP (17.99.99.99) is in black list",
                "subaccount_id": "101",
            }
        }
    }
]

# A batch that MIXES event classes -- batches "may vary from 1 to 350 or more
# events" and are not restricted to one wrapper key.
MIXED_BATCH = [
    DELIVERY_BATCH[0],
    {
        "msys": {
            "track_event": {
                "type": "click",
                "event_id": "92356927693813856",
                "timestamp": "1460989507",
                "message_id": "000443ee14578172be22",
                "rcpt_to": "recipient@example.com",
                "target_link_url": "http://example.com",
                "target_link_name": "Example Link Name",
                "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36",
                "geo_ip": {"city": "Columbia", "country": "US", "region": "MD"},
            }
        }
    },
    {
        "msys": {
            "gen_event": {
                "type": "generation_failure",
                "event_id": "92356927693813856",
                "timestamp": "1460989507",
                "error_code": "554",
                "reason": "MAIL REFUSED - IP (a.b.c.d) is in black list",
                "rcpt_to": "recipient@example.com",
                "template_id": "templ-1234",
            }
        }
    },
    {
        "msys": {
            "unsubscribe_event": {
                "type": "list_unsubscribe",
                "event_id": "92356927693813856",
                "timestamp": "1460989507",
                "rcpt_to": "recipient@example.com",
                "campaign_id": "Example Campaign Name",
                "mailfrom": "recipient@example.com",
            }
        }
    },
    {
        "msys": {
            "ab_test_event": {
                "type": "ab_test_completed",
                "event_id": "0e5cf1fc-cb36-4c39-b695-3651b6ea6563",
                "timestamp": "1460989507",
                "ab_test": {
                    "id": "password-reset",
                    "name": "Password Reset",
                    "version": 1,
                    "winning_template_id": "templ-1234",
                    "engagement_metric": "count_unique_clicked",
                },
            }
        }
    },
    {
        "msys": {
            "ingest_event": {
                "type": "success",
                "event_id": "0e5cf1fc-cb36-4c39-b695-3651b6ea6563",
                "timestamp": "1460989507",
                "batch_id": "96500f4d-d4f4-4f1b-8080-02f4682184bb",
                "number_succeeded": 500,
                "number_duplicates": 350,
            }
        }
    },
]

# The documented sample batch sent by POST /api/v1/webhooks/{id}/validate and by
# the test POST fired when a webhook is created or its target URL changes.
VALIDATION_BATCH = [{"msys": {}}]

# Inbound email, delivered by the SEPARATE relay webhooks API.
RELAY_MESSAGE_BATCH = [
    {
        "msys": {
            "relay_message": {
                "content": {
                    "email_rfc822": "From: sender@example.com\r\nSubject: Hello\r\n\r\nHello",
                    "email_rfc822_is_base64": False,
                    "subject": "Hello",
                    "text": "Hello",
                    "to": ["inbound@parse.example.com"],
                },
                "customer_id": "1",
                "friendly_from": "sender@example.com",
                "msg_from": "sender@example.com",
                "rcpt_to": "inbound@parse.example.com",
                "webhook_id": "4839201967643219",
                "protocol": "smtp",
            }
        }
    }
]


# ---------------------------------------------------------------------------
# Basic authentication
# ---------------------------------------------------------------------------


def test_accepts_valid_basic_credentials():
    assert post(DELIVERY_BATCH, authorization=basic()).status_code == 200


def test_accepts_lowercase_basic_scheme():
    # RFC 7617: the scheme token is case-insensitive.
    res = post(DELIVERY_BATCH, authorization=basic(scheme="basic"))
    assert res.status_code == 200


def test_rejects_wrong_password():
    res = post(DELIVERY_BATCH, authorization=basic(password="wrong-password"))
    assert res.status_code == 401


def test_rejects_wrong_username():
    res = post(DELIVERY_BATCH, authorization=basic(username="wronguser"))
    assert res.status_code == 401


def test_rejects_missing_authorization_header():
    assert post(DELIVERY_BATCH).status_code == 401


def test_sets_www_authenticate_on_401():
    res = post(DELIVERY_BATCH)
    assert res.headers["www-authenticate"] == 'Basic realm="sparkpost"'


def test_rejects_malformed_base64():
    res = post(DELIVERY_BATCH, authorization="Basic !!!not-base64!!!")
    assert res.status_code == 401


def test_rejects_base64_without_a_colon():
    encoded = base64.b64encode(b"nocolonhere").decode("ascii")
    res = post(DELIVERY_BATCH, authorization=f"Basic {encoded}")
    assert res.status_code == 401


def test_rejects_wrong_scheme():
    encoded = base64.b64encode(f"{TEST_USERNAME}:{TEST_PASSWORD}".encode()).decode("ascii")
    res = post(DELIVERY_BATCH, authorization=f"Bearer {encoded}")
    assert res.status_code == 401


def test_rejects_scheme_with_no_credentials():
    assert post(DELIVERY_BATCH, authorization="Basic").status_code == 401


# ---------------------------------------------------------------------------
# verify_basic_auth (unit)
# ---------------------------------------------------------------------------


def test_splits_on_first_colon_only():
    # Passwords may contain colons.
    password = "pa:ss:word"
    header = "Basic " + base64.b64encode(f"{TEST_USERNAME}:{password}".encode()).decode("ascii")
    assert verify_basic_auth(header, TEST_USERNAME, password) is True


def test_accepts_empty_password():
    # `password` is NOT a required field on `auth_credentials`.
    header = "Basic " + base64.b64encode(f"{TEST_USERNAME}:".encode()).decode("ascii")
    assert verify_basic_auth(header, TEST_USERNAME, "") is True
    assert verify_basic_auth(header, TEST_USERNAME, None) is True


def test_rejects_non_empty_password_when_empty_configured():
    header = "Basic " + base64.b64encode(f"{TEST_USERNAME}:something".encode()).decode("ascii")
    assert verify_basic_auth(header, TEST_USERNAME, "") is False


def test_fails_closed_without_configured_username():
    assert verify_basic_auth(basic(), None, None) is False
    assert verify_basic_auth(basic(), "", "") is False


def test_never_raises_on_length_mismatch():
    header = "Basic " + base64.b64encode(b"a:b").decode("ascii")
    assert verify_basic_auth(header, "a-much-longer-username", "and-a-longer-password") is False


def test_handles_non_utf8_credentials_without_raising():
    # Header values can be arbitrary bytes; a decode failure is a rejection.
    encoded = base64.b64encode(b"\xff\xfe:\xff").decode("ascii")
    assert verify_basic_auth(f"Basic {encoded}", TEST_USERNAME, TEST_PASSWORD) is False


# ---------------------------------------------------------------------------
# OAuth 2.0
# ---------------------------------------------------------------------------


def fetch_token(body, content_type="application/json"):
    if content_type == "application/json":
        return client.post("/oauth/token", headers={"Content-Type": content_type}, content=json.dumps(body))
    return client.post("/oauth/token", data=body)


def test_issues_token_for_json_client_credentials():
    res = fetch_token(
        {
            "client_id": TEST_CLIENT_ID,
            "client_secret": TEST_CLIENT_SECRET,
            "grant_type": "client_credentials",
        }
    )
    assert res.status_code == 200
    body = res.json()
    assert isinstance(body["access_token"], str)
    assert body["token_type"] == "Bearer"
    assert body["expires_in"] == 3600


def test_issues_token_for_form_encoded_client_credentials():
    # SparkPost does not document the Content-Type of the token request.
    res = fetch_token(
        {
            "client_id": TEST_CLIENT_ID,
            "client_secret": TEST_CLIENT_SECRET,
            "grant_type": "client_credentials",
        },
        content_type="application/x-www-form-urlencoded",
    )
    assert res.status_code == 200
    assert isinstance(res.json()["access_token"], str)


def test_rejects_wrong_client_credentials():
    res = fetch_token(
        {
            "client_id": TEST_CLIENT_ID,
            "client_secret": "wrong-secret",
            "grant_type": "client_credentials",
        }
    )
    assert res.status_code == 401
    assert res.json()["error"] == "invalid_client"


def test_rejects_unsupported_grant_type():
    res = fetch_token(
        {
            "client_id": TEST_CLIENT_ID,
            "client_secret": TEST_CLIENT_SECRET,
            "grant_type": "password",
        }
    )
    assert res.status_code == 400


def test_accepts_batch_with_valid_bearer_token():
    token = fetch_token(
        {
            "client_id": TEST_CLIENT_ID,
            "client_secret": TEST_CLIENT_SECRET,
            "grant_type": "client_credentials",
        }
    ).json()["access_token"]
    assert post(DELIVERY_BATCH, authorization=f"Bearer {token}").status_code == 200


def test_rejects_unknown_bearer_token():
    assert post(DELIVERY_BATCH, authorization="Bearer not-a-real-token").status_code == 401


def test_rejects_expired_bearer_token_with_401():
    _set_token("expired-token", time.time() - 1)
    res = post(DELIVERY_BATCH, authorization="Bearer expired-token")
    # 401 (not 403): "SparkPost assumes a token is expired if the webhook endpoint
    # returns a response of 400 or 401" and then requests a new one.
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# Legacy X-MessageSystems-Webhook-Token
# ---------------------------------------------------------------------------


def test_accepts_configured_legacy_token():
    assert post(DELIVERY_BATCH, legacy_token=TEST_LEGACY_TOKEN).status_code == 200


def test_rejects_wrong_legacy_token():
    assert post(DELIVERY_BATCH, legacy_token="wrong-token").status_code == 401


# ---------------------------------------------------------------------------
# Fail closed when unconfigured
# ---------------------------------------------------------------------------


@pytest.fixture
def unconfigured():
    saved = {k: os.environ.pop(k, None) for k in AUTH_ENV_KEYS}
    try:
        yield
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def test_rejects_with_500_when_unconfigured(unconfigured):
    # 500, not 401: an operator misconfiguration, distinguishable in logs from a
    # bad caller. It must never be 200.
    assert post(DELIVERY_BATCH, authorization=basic()).status_code == 500


def test_never_returns_200_when_unconfigured(unconfigured):
    assert post(DELIVERY_BATCH).status_code != 200


def test_authenticate_request_reports_unconfigured_state(unconfigured):
    class _FakeRequest:
        headers: dict = {}

    ok, status, reason, _mode = authenticate_request(_FakeRequest())
    assert ok is False
    assert status == 500


# ---------------------------------------------------------------------------
# Payload handling
# ---------------------------------------------------------------------------


def test_returns_200_for_the_validation_batch():
    # A non-200 here blocks webhook creation entirely (HTTP 400 from the Webhooks
    # API), so this is the single most important payload test.
    assert post(VALIDATION_BATCH, authorization=basic()).status_code == 200


def test_handles_a_batch_mixing_event_classes():
    assert post(MIXED_BATCH, authorization=basic()).status_code == 200


def test_handles_a_bounce_event():
    assert post(BOUNCE_BATCH, authorization=basic()).status_code == 200


def test_handles_a_relay_message_entry():
    # Inbound email from the separate relay webhooks API.
    assert post(RELAY_MESSAGE_BATCH, authorization=basic()).status_code == 200


def test_returns_200_for_an_unknown_event_type():
    # Payloads change additively; an unknown type must never fail the batch.
    batch = [{"msys": {"message_event": {"type": "some_future_event", "event_id": "1"}}}]
    assert post(batch, authorization=basic()).status_code == 200


def test_returns_200_for_an_unknown_event_class():
    batch = [{"msys": {"future_event_class": {"type": "whatever"}}}]
    assert post(batch, authorization=basic()).status_code == 200


def test_returns_400_for_invalid_json():
    assert post("{not json", authorization=basic()).status_code == 400


def test_authenticates_before_parsing():
    # Bad credentials with a bad body must still give 401, not 400.
    assert post("{not json", authorization=basic(password="wrong")).status_code == 401


def test_returns_400_when_body_is_not_an_array_or_object():
    assert post('"just a string"', authorization=basic()).status_code == 400


# ---------------------------------------------------------------------------
# Batch idempotency
# ---------------------------------------------------------------------------


def test_duplicate_batch_id_returns_200_without_reprocessing():
    batch_id = next_batch_id()
    first = post(DELIVERY_BATCH, authorization=basic(), batch_id=batch_id)
    second = post(DELIVERY_BATCH, authorization=basic(), batch_id=batch_id)
    assert first.status_code == 200
    # A duplicate batch must still be acknowledged, or SparkPost keeps retrying.
    assert second.status_code == 200


def test_batch_id_header_is_case_insensitive():
    batch_id = next_batch_id()
    # The support docs spell it X-Messagesystems-Batch-Id; the API reference
    # X-MessageSystems-Batch-ID. Both must work.
    first = client.post(
        "/webhooks/sparkpost",
        headers={
            "Content-Type": "application/json",
            "Authorization": basic(),
            "x-messagesystems-batch-id": batch_id,
        },
        content=json.dumps(DELIVERY_BATCH),
    )
    second = post(DELIVERY_BATCH, authorization=basic(), batch_id=batch_id)
    assert first.status_code == 200
    assert second.status_code == 200


def test_accepts_batch_with_no_batch_id_header():
    assert post(DELIVERY_BATCH, authorization=basic(), batch_id=None).status_code == 200


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"
