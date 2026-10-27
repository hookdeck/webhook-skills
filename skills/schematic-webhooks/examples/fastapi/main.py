# Generated with: schematic-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_schematic_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
    tolerance_seconds: int = 0,
) -> Tuple[bool, Optional[str]]:
    """Verify a Schematic webhook.

    Signature = lowercase hex HMAC-SHA256(secret, rawBody + "+" + timestamp), sent as
    the bare digest in X-Schematic-Webhook-Signature (no prefix). The timestamp is the
    X-Schematic-Webhook-Timestamp header, used exactly as received.
    tolerance_seconds = 0 (default) applies no replay window.
    """
    if not signature:
        return False, "Missing signature header"
    if not timestamp:
        return False, "Missing timestamp header"
    if not secret:
        return False, "Webhook secret not configured"

    # Validate format before decoding.
    if not HEX_SHA256.fullmatch(signature):
        return False, "Malformed signature"

    # Body bytes + "+" + header string (latin-1, never trimmed or re-formatted).
    signed_content = b"".join([raw_body, b"+", timestamp.encode("latin-1")])
    expected = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).digest()
    provided = bytes.fromhex(signature)  # 64 hex chars -> 32 bytes, case-insensitive

    if not hmac.compare_digest(provided, expected):
        return False, "Signature mismatch"

    # Opt-in only. Retries and Hookdeck replays resend the original timestamp.
    if tolerance_seconds > 0:
        if not timestamp.isascii() or not timestamp.isdigit():
            return False, "Malformed timestamp"
        if abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
            return False, "Timestamp outside tolerance"

    return True, None


def _tolerance() -> int:
    try:
        return int(os.getenv("SCHEMATIC_WEBHOOK_TOLERANCE_SECONDS") or 0)
    except ValueError:
        return 0


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/schematic")
async def schematic_webhook(request: Request, background_tasks: BackgroundTasks):
    secret = os.getenv("SCHEMATIC_WEBHOOK_SECRET")
    if not secret:
        print("SCHEMATIC_WEBHOOK_SECRET is not set; refusing to accept unverified webhooks")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Exact bytes as received: never request.json() before verifying.
    raw_body = await request.body()

    valid, error = verify_schematic_signature(
        raw_body,
        request.headers.get("x-schematic-webhook-signature"),
        request.headers.get("x-schematic-webhook-timestamp"),
        secret,
        _tolerance(),
    )
    if not valid:
        print(f"Schematic signature verification failed: {error}")
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    # Verified: only now is it safe to parse.
    try:
        event = json.loads(raw_body)
    except ValueError:
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)
    if not isinstance(event, dict):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    # event_id is stable across retries (also sent as X-Schematic-Webhook-Id). Dashboard
    # test sends carry neither, so don't require it.
    event_id = event.get("event_id") or request.headers.get("x-schematic-webhook-id")

    # Acknowledge with a 2xx within 5 seconds; work runs after the response.
    background_tasks.add_task(handle_event, event, event_id)
    return {"received": True}


COMPANY_USER_EVENTS = {
    "company.created",
    "company.updated",
    "company.deleted",
    "company.plan_changed",
    "company.override.created",
    "company.override.updated",
    "company.override.deleted",
    "company.override.expired",
    "user.created",
    "user.updated",
    "user.deleted",
}

CATALOG_EVENTS = {
    "feature.created",
    "feature.updated",
    "feature.deleted",
    "flag.created",
    "flag.updated",
    "flag.deleted",
    "flag_rules.updated",
    "rule.deleted",
    "plan.created",
    "plan.updated",
    "plan.deleted",
    "plan_version.deleted",
    "plan.entitlement.created",
    "plan.entitlement.updated",
    "plan.entitlement.deleted",
}

BILLING_EVENTS = {"subscription.trial.ended"}

USAGE_EVENTS = {
    "entitlement.limit.reached",
    "entitlement.limit.warning",
    "entitlement.soft_limit.reached",
    "entitlement.soft_limit.warning",
    "entitlement.tier_limit.reached",
    "entitlement.tier_limit.warning",
    "credit.limit.reached",
    "credit.limit.warning",
    "credit.purchase.success",
    "auto.topup.hard.failure",
    "auto.topup.retry.exceeded",
    "auto.topup.success",
}


def handle_event(event: dict, event_id: Optional[str]) -> None:
    # TODO: drop the event if event_id is already in your store (when event_id is set).
    action = event.get("action")

    if action in COMPANY_USER_EVENTS:
        print(f"Company/user event {action} (company {event.get('company_id') or 'n/a'})")
    elif action in CATALOG_EVENTS:
        print(f"Catalog event {action} ({event.get('object_type') or 'unknown object'})")
    elif action in BILLING_EVENTS:
        print("Trial ended for a subscription")
    elif action in USAGE_EVENTS:
        print(
            f"Usage event {action} (company {event.get('company_id') or 'n/a'}, "
            f"feature {event.get('feature_id') or 'n/a'})"
        )
    else:
        print(f"Unhandled Schematic event: {action}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
