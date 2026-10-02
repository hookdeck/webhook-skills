# Generated with: sentry-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Sentry Integration Platform webhook receiver (FastAPI).

SENTRY INTEGRATION PLATFORM WEBHOOK VERIFICATION

  algorithm : HMAC-SHA256
  encoding  : lowercase HEX (.hexdigest()) -- NOT base64
  signed    : the RAW request body bytes, nothing else
  key       : the integration's CLIENT SECRET (Settings -> Developer
              Settings -> your integration -> Client Secret), used AS-IS as
              raw UTF-8. NOT the Client ID, NOT an auth token, NOT a DSN.
  header    : Sentry-Hook-Signature, falling back to Sentry-App-Signature

The header value is a BARE 64-character hex digest: no prefix, no ``v1=``, no
``t=``, no comma-separated list, exactly one signature.

Sentry's own server (SentryApp.build_signature):
  hmac.new(key=secret.encode("utf-8"), msg=body.encode("utf-8"),
           digestmod=sha256).hexdigest()

THE TIMESTAMP IS NOT SIGNED. Sentry-Hook-Timestamp is sent but excluded from
the signed string, so there is NO cryptographic replay protection. The optional
tolerance check below is a cheap dampener only. Real protection is
deduplication on the Request-ID header.

ROUTING: the resource is ONLY in the Sentry-Hook-Resource header. The body has
NO ``type`` and NO ``event`` field, only ``action``. The event token is
``header + "." + body["action"]``, e.g. 'issue' + 'created' -> 'issue.created'.

No SDK does this: sentry-sdk is an error-reporting SDK and ships no
webhook-signature verify helper. Manual HMAC with ``hmac`` + ``hashlib``.
"""

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Dict, Mapping, Optional, Union

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request, Response, status

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sentry-webhooks")

app = FastAPI(title="Sentry Webhooks")


def verify_sentry_signature(
    raw_body: Union[bytes, str, None],
    headers: Mapping[str, str],
    client_secret: Optional[str],
) -> bool:
    """Verify a Sentry webhook signature.

    ``raw_body`` may be EMPTY -- some Sentry requests arrive with ``b''`` and
    the signature is then the HMAC of the empty string.
    ``headers`` should be case-insensitive (Starlette's Headers) or lowercased.
    """
    # Fail closed: no secret configured is a rejection, never a bypass.
    if not client_secret:
        return False

    # Sentry-Hook-Signature on subscribed webhooks. Sentry-App-Signature on
    # UI-component external requests (select_options.requested,
    # external_issue.created/linked, alert_rule_action.requested) -- same
    # build_signature, different header name. Sentry's own reference app checks
    # both: "HACK: The signature header may be one of these two values".
    received = headers.get("sentry-hook-signature") or headers.get(
        "sentry-app-signature"
    )
    if not received:
        return False

    # RAW BODY BYTES. Sentry's documented snippet is
    # ``json.dumps(request.body)`` -- re-serializing a parsed body. Python's
    # json.dumps defaults to ", " / ": " separators while Sentry signs compact
    # JSON, so that snippet does not even match ASCII payloads here. Never
    # re-serialize; sign exactly what arrived.
    if raw_body is None:
        raw_body = b""
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")

    expected = hmac.new(
        client_secret.encode("utf-8"),  # Client Secret AS-IS -- never decoded
        raw_body,
        hashlib.sha256,
    ).hexdigest()  # lowercase hex, NOT base64

    # compare_digest handles unequal lengths without raising -- no length
    # guard needed in Python (unlike Node's timingSafeEqual) -- but it raises
    # TypeError on str arguments containing non-ASCII, and Starlette decodes
    # headers as latin-1. Encode both sides so a junk byte is a 401, not a 500.
    return hmac.compare_digest(received.strip().encode("utf-8"), expected.encode("utf-8"))


def is_timestamp_fresh(
    timestamp_header: Optional[str], tolerance_seconds: Optional[int]
) -> bool:
    """Optional replay dampener on Sentry-Hook-Timestamp (UNIX SECONDS).

    NOT a cryptographic check -- the timestamp is not signed. Returns True
    (accept) when no tolerance is configured or the header is absent or
    unparseable, because rejecting on a header Sentry does not sign would drop
    real traffic for no security gain.
    """
    if not tolerance_seconds or tolerance_seconds <= 0:
        return True
    try:
        ts = int(timestamp_header)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return True
    return abs(int(time.time()) - ts) <= tolerance_seconds


def event_token(resource_header: Optional[str], action: Optional[str]) -> str:
    """Recover the event token Sentry does NOT put in the body."""
    return f"{resource_header or 'unknown'}.{action or 'unknown'}"


def _tolerance_from_env() -> Optional[int]:
    raw = os.environ.get("SENTRY_WEBHOOK_TOLERANCE_SECONDS", "").strip()
    try:
        return int(raw) if raw else None
    except ValueError:
        return None


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/webhooks/sentry")
async def sentry_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> Response:
    """Receive a Sentry Integration Platform webhook.

    Reads the RAW body first. Do not declare a Pydantic body model or call
    ``await request.json()`` before verifying: a parsed object cannot be
    re-serialized byte for byte, and it fails on Sentry's legitimate EMPTY
    body (Sentry's reference app: "Flask will throw a 400 Bad Request ...
    because Sentry sends an empty body").
    """
    raw_body = await request.body()

    client_secret = os.environ.get("SENTRY_CLIENT_SECRET")

    # FAIL CLOSED on misconfiguration. 500 (not 401) so an operator can tell
    # "my server is misconfigured" apart from "someone sent a bad signature".
    if not client_secret:
        logger.error(
            "SENTRY_CLIENT_SECRET is not set -- refusing to accept unverified webhooks"
        )
        return _json_response(
            {"error": "Webhook client secret not configured"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Starlette's Headers are case-insensitive; Sentry sends them title-cased.
    headers = request.headers
    resource = headers.get("sentry-hook-resource")
    request_id = headers.get("request-id")
    timestamp = headers.get("sentry-hook-timestamp")

    # There is NO handshake, NO challenge and NO validation request.
    if not headers.get("sentry-hook-signature") and not headers.get(
        "sentry-app-signature"
    ):
        logger.error("Missing Sentry-Hook-Signature / Sentry-App-Signature header")
        return _json_response(
            {"error": "Missing signature header"}, status.HTTP_401_UNAUTHORIZED
        )

    if not verify_sentry_signature(raw_body, headers, client_secret):
        logger.error("Sentry webhook signature verification failed")
        return _json_response(
            {"error": "Invalid signature"}, status.HTTP_401_UNAUTHORIZED
        )

    tolerance = _tolerance_from_env()
    if not is_timestamp_fresh(timestamp, tolerance):
        logger.error(
            "Sentry-Hook-Timestamp outside %ss tolerance: %s", tolerance, timestamp
        )
        return _json_response({"error": "Stale timestamp"}, status.HTTP_400_BAD_REQUEST)

    # Verified -- only now is it safe to parse. An EMPTY body is legitimate
    # (select_options.requested signs ""), so treat it as an empty envelope.
    event: Dict[str, Any] = {}
    if raw_body:
        try:
            event = json.loads(raw_body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            logger.error("Verified request had an unparseable body: %s", exc)
            return _json_response({"error": "Invalid JSON"}, status.HTTP_400_BAD_REQUEST)
    if not isinstance(event, dict):
        event = {}

    # IDEMPOTENCY KEY: the Request-ID header (per-request uuid4 hex). The body
    # has NO delivery id, and because the timestamp is not signed a replay
    # carries a valid signature forever -- dedupe on Request-ID.
    token = event_token(resource, event.get("action"))

    logger.info(
        "Verified Sentry webhook: %s (Request-ID %s, installation %s)",
        token,
        request_id or "n/a",
        (event.get("installation") or {}).get("uuid"),
    )

    # Acknowledge inside Sentry's 1-SECOND budget, then work asynchronously.
    # Sentry does NOT retry, and repeated failures trip a circuit breaker that
    # can disable the webhook. For real workloads, push to a proper queue.
    background_tasks.add_task(handle_event, token, event)

    return _json_response({"received": True}, status.HTTP_200_OK)


def _describe_actor(actor: Optional[Dict[str, Any]]) -> str:
    # actor.id is str | int: Sentry itself sends
    # {"type": "application", "id": "sentry", "name": "Sentry"}.
    if not actor:
        return "unknown actor"
    return f"{actor.get('name') or actor.get('id')} ({actor.get('type')})"


def handle_event(token: str, event: Dict[str, Any]) -> None:
    """Dispatch a verified Sentry event by its ``resource.action`` token."""
    # TODO: check the Request-ID against your store and return early if seen.

    # `data` is resource-specific AND customizable via UI components.
    data = event.get("data") or {}
    action = event.get("action")
    issue = data.get("issue") or {}

    if token == "installation.created":
        installation = data.get("installation") or {}
        logger.info(
            "Installed by %s in org %s (installation %s)",
            _describe_actor(event.get("actor")),
            (installation.get("organization") or {}).get("slug"),
            installation.get("uuid"),
        )
    elif token == "installation.deleted":
        logger.info("Uninstalled: installation %s", (data.get("installation") or {}).get("uuid"))

    elif token == "issue.created":
        # Fires for the OUTAGE, ERROR and FEEDBACK categories -- branch on
        # issueCategory before assuming a stack trace exists.
        logger.info(
            "Issue created: %s %r [%s/%s]",
            issue.get("id"),
            issue.get("title"),
            issue.get("issueCategory"),
            issue.get("issueType"),
        )
    elif token in ("issue.resolved", "issue.assigned", "issue.unresolved"):
        logger.info("Issue %s: %s (substatus %s)", action, issue.get("id"), issue.get("substatus"))
    # THE WIRE TOKEN IS issue.ignored; the docs call it "archived" and
    # issue.archived is kept as an alias. HANDLE BOTH.
    elif token in ("issue.ignored", "issue.archived"):
        logger.info("Issue archived/ignored: %s (substatus %s)", issue.get("id"), issue.get("substatus"))

    elif token == "error.created":
        # Business plan and above only. High volume -- queue, never inline.
        error = data.get("error") or {}
        logger.info("Error created: issue %s (%s)", error.get("issue_id"), error.get("web_url"))

    elif token in ("comment.created", "comment.updated", "comment.deleted"):
        logger.info(
            "Comment %s: %s on issue %s (%s)",
            action,
            data.get("comment_id"),
            data.get("issue_id"),
            data.get("project_slug"),
        )

    # The header says `event_alert`, NOT `issue_alert`.
    elif token == "event_alert.triggered":
        sentry_event = data.get("event") or {}
        # tags is an ARRAY OF [key, value] PAIRS, not an object.
        tags = dict(sentry_event.get("tags") or [])
        logger.info(
            "Issue alert triggered by rule %r: issue %s level=%s (%s)",
            data.get("triggered_rule"),
            sentry_event.get("issue_id"),
            tags.get("level"),
            sentry_event.get("web_url"),
        )

    elif token == "activity_alert.triggered":
        logger.info(
            "Activity alert: %s on issue %s (%s)",
            (data.get("activity") or {}).get("type"),
            issue.get("id"),
            (data.get("alert") or {}).get("web_url"),
        )

    # metric_alert.open is in Sentry's server enum but NOT in the docs' list.
    elif token in (
        "metric_alert.critical",
        "metric_alert.warning",
        "metric_alert.resolved",
        "metric_alert.open",
    ):
        logger.info(
            "Metric alert %s: %s -- %s (%s)",
            action,
            data.get("description_title"),
            data.get("description_text"),
            data.get("web_url"),
        )

    elif token in ("seer.pr_created", "seer.pr_ready_for_review"):
        # Each entry is {"pull_request": {"pr_number", "pr_url", "pr_id"},
        # "repo_name", "provider"} -- the PR fields are NESTED.
        prs = data.get("pull_requests") or [{}]
        pr = prs[0].get("pull_request") or {}
        logger.info(
            "Seer %s: #%s %s (%s)",
            action,
            pr.get("pr_number"),
            pr.get("pr_url"),
            prs[0].get("repo_name"),
        )
    elif token.startswith("seer."):
        # run_id + group_id correlate every event in one Seer run.
        logger.info("Seer %s: run %s on issue %s", action, data.get("run_id"), data.get("group_id"))

    # CAMELCASE KEYS HERE, and a *_completed action CAN mean failure.
    elif token in (
        "preprod_artifact.size_analysis_completed",
        "preprod_artifact.build_distribution_completed",
    ):
        if data.get("state") == "FAILED":
            logger.info(
                "%s FAILED for build %s: %s %s",
                action,
                data.get("buildId"),
                data.get("errorCode"),
                data.get("errorMessage"),
            )
        else:
            logger.info("%s for build %s (%s)", action, data.get("buildId"), data.get("projectSlug"))

    else:
        # New resources and actions land in Sentry's server enum ahead of the docs.
        logger.info("Unhandled Sentry event: %s", token)


def _json_response(payload: Dict[str, Any], status_code: int) -> Response:
    return Response(
        content=json.dumps(payload),
        status_code=status_code,
        media_type="application/json",
    )


if __name__ == "__main__":
    import uvicorn

    if not os.environ.get("SENTRY_CLIENT_SECRET"):
        logger.warning("SENTRY_CLIENT_SECRET is not set")
        logger.warning("Every delivery will be rejected until you set it")

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
