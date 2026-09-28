# Generated with: sparkpost-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import binascii
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI(title="SparkPost Webhooks Example")

# ---------------------------------------------------------------------------
# Authentication
#
# SparkPost EVENT WEBHOOKS ARE NOT SIGNED. There is no HMAC, no signature header
# and no signing secret -- so there is deliberately no hmac.new() over a request
# body anywhere in this file. Authentication is credential based and optional,
# set by the webhook's `auth_type` field, whose enum is exactly
# `none` | `basic` | `oauth2`.
#
# (Bird's newer platform webhooks -- bird.com -- DO use Standard Webhooks
# signing. That is a different product. Don't implement it here.)
# ---------------------------------------------------------------------------


def secure_equals(a: str, b: str) -> bool:
    """Constant-time string compare via fixed-length digests.

    ``hmac.compare_digest`` refuses ``str`` arguments containing non-ASCII
    characters (it raises TypeError), and comparing raw strings of different
    lengths leaks length. Hashing both sides first gives two 32-byte digests, so
    length carries no information and the comparison never raises.
    """
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_basic_auth(
    authorization_header: Optional[str],
    username: Optional[str],
    password: Optional[str],
) -> bool:
    """Verify an RFC 7617 Basic credential (``auth_type: "basic"``).

    SparkPost sends ``Authorization: Basic base64(username + ":" + password)``.
    The credentials are the ones YOUR endpoint defines -- the docs stress they are
    "not your SparkPost username and password".

    Fails CLOSED: a missing header or unconfigured username is a rejection.
    """
    if not authorization_header or not username:
        return False

    parts = authorization_header.strip().split()
    if len(parts) != 2:
        return False

    # RFC 7617: the scheme token is case-insensitive.
    if parts[0].lower() != "basic":
        return False

    # Unlike Node, base64.b64decode RAISES on invalid input -- and the decoded
    # bytes may not be valid UTF-8 either. Both are rejections, not 500s.
    try:
        decoded = base64.b64decode(parts[1], validate=True).decode("utf-8")
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return False

    # Split on the FIRST colon only: passwords may contain colons.
    user, sep, passwd = decoded.partition(":")
    if not sep:
        return False

    # `password` is NOT a required field on `auth_credentials` -- an empty
    # password is legitimate, so normalise an unset env var to "" rather than
    # treating it as "not configured".
    expected_password = "" if password is None else password

    # Compare BOTH halves, and always both, so the response time doesn't reveal
    # which half was wrong.
    user_ok = secure_equals(user, username)
    pass_ok = secure_equals(passwd, expected_password)
    return user_ok and pass_ok


# ---------------------------------------------------------------------------
# OAuth 2.0 (`auth_type: "oauth2"`) -- optional Bearer token check.
#
# SparkPost POSTs `auth_request_details.body` (client_id / client_secret /
# grant_type) to YOUR token URL, then sends every batch with
# `Authorization: Bearer {token}`.
#
# THE IN-MEMORY STORE BELOW IS ILLUSTRATIVE. It does not survive a restart and
# does not work across workers. In production point `auth_request_details.url` at
# your real authorization server (Auth0, Okta, Keycloak, ...) and replace
# validate_bearer_token with JWT signature verification or token introspection
# (RFC 7662).
# ---------------------------------------------------------------------------

DEFAULT_TOKEN_TTL_SECONDS = 3600

# token -> expiry (epoch seconds)
_issued_tokens: Dict[str, float] = {}


def issue_token(ttl_seconds: int = DEFAULT_TOKEN_TTL_SECONDS) -> Dict[str, Any]:
    token = secrets.token_hex(32)
    _issued_tokens[token] = time.time() + ttl_seconds
    return {"access_token": token, "token_type": "Bearer", "expires_in": ttl_seconds}


def validate_bearer_token(token: Optional[str]) -> bool:
    """Pluggable Bearer validation. Swap for JWT verification or introspection.

    Returning False makes the route answer 401 -- which is exactly what SparkPost
    needs: per the support-doc FAQ, "SparkPost assumes a token is expired if the
    webhook endpoint returns a response of 400 or 401", and it then requests a new
    token. Answering 403 would leave it stuck with a dead token.
    """
    if not token:
        return False
    expires_at = _issued_tokens.get(token)
    if expires_at is None:
        return False
    if time.time() >= expires_at:
        del _issued_tokens[token]
        return False
    return True


def _set_token(token: str, expires_at: float) -> None:
    """Test seam: register a token with an explicit expiry (epoch seconds)."""
    _issued_tokens[token] = expires_at


def oauth_configured() -> bool:
    """Is the OAuth 2.0 demo flow configured at all?"""
    return bool(
        os.environ.get("SPARKPOST_OAUTH_CLIENT_ID")
        and os.environ.get("SPARKPOST_OAUTH_CLIENT_SECRET")
    )


# ---------------------------------------------------------------------------
# Combined auth decision
# ---------------------------------------------------------------------------


def authenticate_request(request: Request) -> Tuple[bool, int, str, str]:
    """Authenticate one batch POST.

    Accepts EITHER a valid Basic header (Mode 1) OR a valid Bearer token
    (Mode 2) OR -- only when SPARKPOST_WEBHOOK_TOKEN is set -- the deprecated
    ``X-MessageSystems-Webhook-Token`` header.

    Env is read per request (not at import time) so configuration can change
    without a restart, and so tests can exercise the unconfigured case.

    :returns: ``(ok, status, reason, mode)``
    """
    # Starlette's Headers mapping is case-insensitive, which matters: the docs
    # spell the legacy token header several ways.
    authorization = request.headers.get("authorization")
    legacy_token = request.headers.get("x-messagesystems-webhook-token")

    username = os.environ.get("SPARKPOST_WEBHOOK_USERNAME")
    password = os.environ.get("SPARKPOST_WEBHOOK_PASSWORD")
    configured_token = os.environ.get("SPARKPOST_WEBHOOK_TOKEN")

    basic_configured = bool(username)
    legacy_configured = bool(configured_token)
    oauth = oauth_configured()

    # FAIL CLOSED. `auth_type` defaults to "none", which makes "accept anything"
    # tempting -- it would let anyone who learns the URL inject fake email events.
    # 500 (not 401) so an operator misconfiguration is distinguishable from a bad
    # caller in the logs.
    if not basic_configured and not legacy_configured and not oauth:
        return False, 500, "Webhook authentication not configured", ""

    if basic_configured and verify_basic_auth(authorization, username, password):
        return True, 200, "", "basic"

    if oauth and authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer" and validate_bearer_token(parts[1]):
            return True, 200, "", "oauth2"

    # Deprecated header-based token. Also how RELAY webhooks authenticate, since
    # relay webhooks have no Basic Auth mode (their auth_type enum is only
    # `none` | `oauth2`).
    if legacy_configured and legacy_token and secure_equals(legacy_token, configured_token or ""):
        return True, 200, "", "legacy-token"

    return False, 401, "Unauthorized", ""


class SparkPostAuthError(Exception):
    def __init__(self, status: int, reason: str) -> None:
        self.status = status
        self.reason = reason


async def require_sparkpost_auth(request: Request) -> str:
    """FastAPI dependency: authenticate before the handler body runs.

    Ordering matters: a dependency runs before the route function reads the body,
    so a malformed payload from an unauthenticated caller can never answer 400
    ahead of the credential check.
    """
    ok, status, reason, mode = authenticate_request(request)
    if ok:
        return mode
    print(f"SparkPost webhook rejected: {reason}")
    raise SparkPostAuthError(status, reason)


@app.exception_handler(SparkPostAuthError)
async def sparkpost_auth_error_handler(request: Request, exc: SparkPostAuthError) -> Response:
    headers = {}
    if exc.status == 401:
        # The correct RFC 7617 response to a rejected Basic credential.
        headers["WWW-Authenticate"] = 'Basic realm="sparkpost"'
    return JSONResponse({"error": exc.reason}, status_code=exc.status, headers=headers)


# ---------------------------------------------------------------------------
# Event dispatch
# ---------------------------------------------------------------------------

# The seven event-class wrapper keys. The single key under `msys` says which class
# an event belongs to -- NEVER hardcode only `message_event`.
EVENT_CLASSES = frozenset(
    {
        "message_event",
        "track_event",
        "gen_event",
        "unsubscribe_event",
        "relay_event",
        "ab_test_event",
        "ingest_event",
    }
)

# Batch-level idempotency.
#
# "Each webhook batch contains the header X-MessageSystems-Batch-ID, which is
# useful for detecting and prevention of processing duplicate batches."
# A duplicate batch still gets a 200 -- "If you get a duplicate batch, return a
# 200 response so SparkPost will not keep retrying."
#
# A set is fine for a demo; use Redis or a table with a TTL in production, and
# dedupe individual events on `event_id` too.
_seen_batch_ids: set = set()


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/oauth/token")
async def oauth_token(request: Request) -> Response:
    """Demo OAuth 2.0 token endpoint -- the target for a webhook's
    ``auth_request_details.url`` when ``auth_type`` is ``"oauth2"``.

    SparkPost POSTs ``auth_request_details.body`` here, stores the returned token,
    and then sends every batch with ``Authorization: Bearer {token}``. The GET
    webhook response shows SparkPost keeping exactly the shape returned below:
    ``"auth_credentials": {"access_token": "<oauth token>", "expires_in": 3600}``.

    IN PRODUCTION use your real authorization server instead.
    """
    if not oauth_configured():
        return JSONResponse(
            {"error": "server_error", "error_description": "OAuth not configured"},
            status_code=500,
        )

    # SparkPost does NOT document whether it sends the token request as JSON or as
    # application/x-www-form-urlencoded, so accept both.
    body = await _parse_token_request(request)
    if body is None:
        return JSONResponse({"error": "invalid_request"}, status_code=400)

    client_id = body.get("client_id")
    client_secret = body.get("client_secret")
    grant_type = body.get("grant_type")

    # grant_type is treated as optional: SparkPost's documented body includes
    # "client_credentials", but the API reference only says the body "likely should
    # contain the client ID, client secret, and grant type".
    if grant_type is not None and grant_type != "client_credentials":
        return JSONResponse({"error": "unsupported_grant_type"}, status_code=400)

    if (
        not isinstance(client_id, str)
        or not isinstance(client_secret, str)
        or not secure_equals(client_id, os.environ.get("SPARKPOST_OAUTH_CLIENT_ID", ""))
        or not secure_equals(client_secret, os.environ.get("SPARKPOST_OAUTH_CLIENT_SECRET", ""))
    ):
        return JSONResponse({"error": "invalid_client"}, status_code=401)

    return JSONResponse(issue_token(), status_code=200)


async def _parse_token_request(request: Request) -> Optional[Dict[str, Any]]:
    content_type = request.headers.get("content-type", "")
    raw = await request.body()

    if "application/x-www-form-urlencoded" in content_type:
        from urllib.parse import parse_qsl

        return dict(parse_qsl(raw.decode("utf-8", errors="replace")))

    # Default to JSON -- including when no Content-Type is sent at all -- and fall
    # back to form parsing if the body clearly isn't JSON.
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
        return None
    except (json.JSONDecodeError, UnicodeDecodeError):
        text = raw.decode("utf-8", errors="replace")
        if "=" in text:
            from urllib.parse import parse_qsl

            return dict(parse_qsl(text))
        return None


@app.post("/webhooks/sparkpost")
async def sparkpost_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    auth_mode: str = Depends(require_sparkpost_auth),
) -> Response:
    """SparkPost event webhook endpoint.

    The dependency above has already authenticated the request -- including the
    creation/validation test batch.
    """
    # 1. Batch-level dedupe. Starlette's header lookup is case-insensitive, which
    #    is needed because the API reference spells it X-MessageSystems-Batch-ID
    #    and the support docs X-Messagesystems-Batch-Id.
    batch_id = request.headers.get("x-messagesystems-batch-id")

    if batch_id and batch_id in _seen_batch_ids:
        print(f"Duplicate batch {batch_id} - acknowledging without reprocessing")
        return PlainTextResponse("OK", status_code=200)

    # 2. Read the raw bytes, then parse. The raw bytes aren't needed for
    #    verification (nothing is signed) but the recommended pattern is "Store
    #    the raw data to disk or S3 and then asyncronously process it."
    raw_body = await request.body()

    try:
        parsed = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        print("SparkPost webhook body was not valid JSON")
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # The body is always a JSON ARRAY of events. A single object is tolerated
    # defensively; anything else is not a SparkPost batch.
    if isinstance(parsed, list):
        events: Optional[List[Any]] = parsed
    elif isinstance(parsed, dict):
        events = [parsed]
    else:
        events = None

    if events is None:
        print("SparkPost webhook body was not a JSON array")
        return JSONResponse({"error": "Expected a JSON array of events"}, status_code=400)

    if batch_id:
        _seen_batch_ids.add(batch_id)

    # 3. Queue the work, then answer 200.
    #
    #    The create/validate test explicitly requires 200, and any non-2xx is
    #    retried: "if you do not return a 200 for the batch we will continue to
    #    resend even if you processed and stored part of the batch". The timeout is
    #    10 seconds, with 12 attempts over 8 hours -- so persist the raw batch and
    #    defer real work. A BackgroundTask runs AFTER the response is sent; use a
    #    real queue for anything heavier.
    background_tasks.add_task(process_batch, events, batch_id)

    return PlainTextResponse("OK", status_code=200)


def process_batch(events: List[Any], batch_id: Optional[str]) -> None:
    print(f"SparkPost batch {batch_id or '(no batch id)'} - {len(events)} entry/entries")

    for entry in events:
        if not isinstance(entry, dict) or not isinstance(entry.get("msys"), dict):
            print("Skipping entry without an msys wrapper")
            continue

        msys = entry["msys"]

        # THE VALIDATION / TEST BATCH. `POST /api/v1/webhooks/{id}/validate` -- and
        # the test POST fired when a webhook is created or its target changes --
        # sends literally `[{"msys":{}}]`: an empty msys object with no event
        # class. It must NOT raise, and the response must be 200, or the webhook
        # cannot be created ("your request to the Webhook API will fail with HTTP
        # 400 and the webhook will not be created"). There is no "ping" event type.
        if not msys:
            print("Validation/test batch (empty msys) - acknowledged")
            continue

        for wrapper_key, payload in msys.items():
            # Relay webhooks are a SEPARATE API (/api/v1/relay-webhooks) that
            # delivers INBOUND EMAIL as msys.relay_message. Not to be confused
            # with `relay_event` (relay_injection / relay_delivery / ... status
            # events, which arrive through event webhooks).
            if wrapper_key == "relay_message":
                handle_relay_message(payload or {})
                continue

            if wrapper_key not in EVENT_CLASSES:
                # Additive changes are expected: "Webhooks consumers should be
                # flexible enough to accept additive changes to the payload."
                print(f"Unknown event class '{wrapper_key}' - logged, not failed")
                continue

            handle_event(wrapper_key, payload or {})


def handle_event(event_class: str, event: Dict[str, Any]) -> None:
    # Most scalar fields are STRINGS even when numeric: "timestamp":
    # "1460989507" (Unix SECONDS as a string), "num_retries": "2",
    # "bounce_class": "1", "subaccount_id": "101".
    event_type = event.get("type")
    event_id = event.get("event_id")  # opaque: big integer for some types, UUID for others

    # TODO: event-level idempotency -- skip if you have already stored event_id.

    # --- message_event ---
    if event_type == "delivery":
        print(
            f"delivery to {event.get('rcpt_to')} "
            f"(message_id={event.get('message_id')}, retries={event.get('num_retries')})"
        )
    elif event_type in ("bounce", "out_of_band"):
        # Suppress the address. bounce_class distinguishes hard from soft.
        print(
            f"{event_type} for {event.get('rcpt_to')}: class={event.get('bounce_class')} "
            f"code={event.get('error_code')} - {event.get('reason')}"
        )
    elif event_type == "injection":
        print(
            f"injection accepted for {event.get('rcpt_to')} "
            f"(transmission_id={event.get('transmission_id')})"
        )
    elif event_type == "delay":
        print(
            f"delay for {event.get('rcpt_to')}: code={event.get('error_code')} "
            f"retries={event.get('num_retries')}"
        )
    elif event_type == "spam_complaint":
        # Remove from all mailing lists immediately.
        print(
            f"spam_complaint from {event.get('rcpt_to')} "
            f"(fbtype={event.get('fbtype')}, report_by={event.get('report_by')})"
        )
    elif event_type == "policy_rejection":
        print(f"policy_rejection for {event.get('rcpt_to')}: {event.get('reason')}")
    elif event_type == "sms_status":
        print(f"sms_status {event.get('stat_state')} for {event.get('sms_dst')}")

    # --- track_event ---
    elif event_type in ("click", "amp_click"):
        print(
            f"{event_type} by {event.get('rcpt_to')} -> {event.get('target_link_url')} "
            f"({event.get('target_link_name')})"
        )
    elif event_type in ("open", "initial_open", "amp_open", "amp_initial_open"):
        geo = event.get("geo_ip") or {}
        print(f"{event_type} by {event.get('rcpt_to')} ({geo.get('country', 'unknown')})")

    # --- gen_event ---
    elif event_type in ("generation_failure", "generation_rejection"):
        print(
            f"{event_type} for {event.get('rcpt_to')}: {event.get('reason')} "
            f"(template={event.get('template_id')})"
        )

    # --- unsubscribe_event ---
    elif event_type in ("list_unsubscribe", "link_unsubscribe"):
        print(f"{event_type} by {event.get('rcpt_to')} (campaign={event.get('campaign_id')})")

    # --- relay_event (status events about inbound relaying) ---
    elif event_type in (
        "relay_injection",
        "relay_rejection",
        "relay_delivery",
        "relay_tempfail",
        "relay_permfail",
    ):
        print(f"{event_type} ({event_class}) for {event.get('rcpt_to')}")

    # --- ab_test_event ---
    elif event_type in ("ab_test_completed", "ab_test_cancelled"):
        ab_test = event.get("ab_test") or {}
        print(f"{event_type}: {ab_test.get('id')} winner={ab_test.get('winning_template_id')}")

    # --- ingest_event ---
    elif event_type == "success":
        print(
            f"ingest success batch={event.get('batch_id')} "
            f"succeeded={event.get('number_succeeded')} duplicates={event.get('number_duplicates')}"
        )
    elif event_type == "error":
        print(
            f"ingest error batch={event.get('batch_id')} type={event.get('error_type')} "
            f"failed={event.get('number_failed')} retryable={event.get('retryable')}"
        )

    else:
        # A type you don't recognise is normal -- SparkPost adds event types over
        # time. Log it and keep going; never fail the batch.
        print(f"Unhandled {event_class} type '{event_type}' (event_id={event_id})")


def handle_relay_message(message: Dict[str, Any]) -> None:
    """Inbound email from a RELAY webhook (separate API)."""
    content = message.get("content") or {}
    print(
        f"relay_message from {message.get('msg_from')} to {message.get('rcpt_to')}: "
        f"{content.get('subject')}"
    )
    # content["email_rfc822"] holds the full MIME message; check
    # content["email_rfc822_is_base64"] before decoding.


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    if not (
        os.environ.get("SPARKPOST_WEBHOOK_USERNAME")
        or oauth_configured()
        or os.environ.get("SPARKPOST_WEBHOOK_TOKEN")
    ):
        print("WARNING: no credentials configured - every batch will be rejected with 500")
        print("  Set SPARKPOST_WEBHOOK_USERNAME (+ PASSWORD) for Basic Auth: auth_type 'basic'")

    uvicorn.run(app, host="0.0.0.0", port=port)
