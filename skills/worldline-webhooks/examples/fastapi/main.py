# Generated with: worldline-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Worldline Connect / Worldline Direct webhook receiver for FastAPI.

Both platforms share one signing scheme:
    X-GCS-Signature = base64( HMAC-SHA256(webhooks secret key, raw body bytes) )
    X-GCS-KeyId     = id of the webhooks key that signed the message
No timestamp, no nonce, nothing else in the signing input. The key is the
dedicated webhooks secret key, NOT the REST API key.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, Optional, Set, Union

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

logger = logging.getLogger("worldline-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Worldline Webhook Handler")

WEBHOOK_PATH = "/webhooks/worldline"


def load_secret_key_store() -> Dict[str, str]:
    """Key id -> secret, read from env per request (a missing var fails closed, not at import).

    Connect signs with the OLDEST key on the account, so during a rotation both
    keys must be resolvable by id.
    """
    store: Dict[str, str] = {}
    pairs = (
        ("WORLDLINE_WEBHOOK_KEY_ID", "WORLDLINE_WEBHOOK_SECRET"),
        ("WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS", "WORLDLINE_WEBHOOK_SECRET_PREVIOUS"),
    )
    for key_id_var, secret_var in pairs:
        key_id, secret = os.environ.get(key_id_var, ""), os.environ.get(secret_var, "")
        if key_id and secret:
            store[key_id] = secret
    return store


def verify_worldline_signature(
    raw_body: Union[bytes, str], signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify X-GCS-Signature (standard padded base64) against the exact bytes Worldline sent."""
    if not signature or not secret:
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(signature.encode("utf-8"), expected.encode("utf-8"))


def custom_header_matches(request: Request) -> bool:
    """Optional defence-in-depth: the custom "webhooks header" (Connect). Never replaces the HMAC."""
    name = os.environ.get("WORLDLINE_CUSTOM_HEADER_NAME", "")
    value = os.environ.get("WORLDLINE_CUSTOM_HEADER_VALUE", "")
    if not name or not value:
        return True  # layer not configured; the HMAC check still ran
    received = request.headers.get(name, "")
    return hmac.compare_digest(received.encode("utf-8"), value.encode("utf-8"))


# Documented event types. Unknown types are acknowledged (2xx), never rejected.
CONNECT_EVENTS: Set[str] = {
    "payment.created", "payment.redirected", "payment.pending_payment", "payment.account_verified",
    "payment.pending_fraud_approval", "payment.authorization_requested", "payment.pending_approval",
    "payment.pending_completion", "payment.pending_capture", "payment.capture_requested",
    "payment.captured", "payment.paid", "payment.paid_increment", "payment.completed",
    "payment.capture_in_progress", "payment.reversed", "payment.chargeback_notification",
    "payment.chargebacked", "payment.rejected", "payment.rejected_capture", "payment.cancelled",
    "payment.refunded",
    "refund.created", "refund.pending_approval", "refund.rejected", "refund.refund_requested",
    "refund.captured", "refund.refunded", "refund.cancelled",
    "payout.created", "payout.pending_approval", "payout.rejected", "payout.payout_requested",
    "payout.account_credited", "payout.rejected_credit", "payout.cancelled", "payout.reversed",
    "token.created", "token.updated", "token.expired", "token.expiring_soon", "token.deleted",
    "dispute.draft", "dispute.created", "dispute.invalid_representment", "dispute.send_to_bank",
    "dispute.success", "dispute.expired", "dispute.cancelled",
    "capture.created", "capture.rejected", "capture.cancelled", "capture.captured", "capture.paid",
    "capture.chargebacked", "capture.chargeback_notification", "capture.requested",
}

DIRECT_EVENTS: Set[str] = {
    "payment.created", "payment.redirected", "payment.authorization_requested",
    "payment.pending_approval", "payment.pending_completion", "payment.pending_capture",
    "payment.capture_requested", "payment.captured", "payment.rejected", "payment.rejected_capture",
    "payment.cancelled", "payment.refunded", "refund.refund_requested",
    "paymentlink.created", "paymentlink.clicked", "paymentlink.paid", "paymentlink.cancelled",
    "paymentlink.expired", "paymentlink.payment.rejected", "paymentlink.payment.cancelled",
}

# Object prefix of `type` -> body key holding the resource. Explicit because
# Direct's `paymentlink.*` events carry the object under `paymentLink`.
RESOURCE_KEYS: Dict[str, str] = {
    "payment": "payment",
    "refund": "refund",
    "payout": "payout",
    "token": "token",
    "dispute": "dispute",
    "capture": "capture",
    "paymentlink": "paymentLink",
}


def resource_key_for(event_type: str) -> Optional[str]:
    """Everything before the FIRST dot. `paymentlink.payment.rejected` -> `paymentlink`."""
    prefix, dot, _ = event_type.partition(".")
    return RESOURCE_KEYS.get(prefix) if dot and prefix else None


# Demo-only dedupe store. Use a database unique constraint on the event id in production.
seen_event_ids: Set[str] = set()


def process_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Runs AFTER the response (Connect times out at 10 seconds).

    Logs only non-sensitive fields: payloads carry masked PANs, 3-D Secure data
    and fraud results.
    """
    key = resource_key_for(event.get("type", ""))
    resource = (event.get(key) if key else None) or {}
    output = resource.get("paymentOutput") or resource.get("refundOutput") or {}
    money = output.get("amountOfMoney") or {}
    summary = {
        "eventId": event.get("id"),
        "type": event.get("type"),
        "merchantId": event.get("merchantId"),
        "resourceId": resource.get("id"),
        "status": resource.get("status"),
        # Amounts are integer minor units: 1000 EUR = EUR 10.00.
        "amount": money.get("amount"),
        "currency": money.get("currencyCode"),
        # Direct changes payment.id on capture/refund: correlate on merchantReference too.
        "merchantReference": (output.get("references") or {}).get("merchantReference"),
    }

    # Arrival order is not event order. Compare against the resource's own status
    # (or re-read it via the REST API) instead of trusting the sequence.
    event_type = summary["type"]
    if event_type in ("payment.captured", "payment.paid", "payment.completed"):
        logger.info("Payment settled: fulfil the order %s", summary)
    elif event_type in ("payment.rejected", "payment.cancelled"):
        logger.info("Payment did not complete %s", summary)
    elif event_type == "refund.refunded":
        logger.info("Refund completed %s", summary)
    elif event_type == "token.deleted":
        # "The event's token payload will contain only an id."
        logger.info("Token deleted %s", {"eventId": event.get("id"), "tokenId": resource.get("id")})
    elif event_type == "dispute.created":
        logger.info("Dispute opened %s", summary)
    elif event_type == "paymentlink.paid":
        logger.info("Payment link paid %s", summary)
    else:
        logger.info("Worldline event received %s", summary)
    return summary


async def verified_worldline_body(
    request: Request,
    x_gcs_signature: Optional[str] = Header(default=None),
    x_gcs_keyid: Optional[str] = Header(default=None),
) -> bytes:
    """Dependency: returns the raw body only if X-GCS-Signature verifies, else 401."""
    store = load_secret_key_store()
    if not store:
        # Fail closed: never skip verification because the secret is missing.
        logger.error("WORLDLINE_WEBHOOK_KEY_ID / WORLDLINE_WEBHOOK_SECRET not set: rejecting webhook")
        raise HTTPException(status_code=401, detail="Webhook secret not configured")
    if not x_gcs_signature or not x_gcs_keyid:
        raise HTTPException(status_code=401, detail="Missing X-GCS-Signature or X-GCS-KeyId")

    # Look the secret up by key id. An unknown id is rejected; never fall back
    # to "the one secret we have".
    secret = store.get(x_gcs_keyid)
    if not secret:
        logger.error("Unknown X-GCS-KeyId %s: rejecting webhook", x_gcs_keyid)
        raise HTTPException(status_code=401, detail="Unknown key id")

    # Raw bytes, not request.json(): the HMAC covers the exact body Worldline sent.
    raw_body = await request.body()
    if not verify_worldline_signature(raw_body, x_gcs_signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")
    if not custom_header_matches(request):
        raise HTTPException(status_code=401, detail="Invalid custom header")
    return raw_body


@app.get(WEBHOOK_PATH, response_class=PlainTextResponse)
async def worldline_endpoint_verification(
    x_gcs_webhooks_endpoint_verification: Optional[str] = Header(default=None),
):
    """Connect endpoint verification.

    When an endpoint is created (or activated), Connect sends an UNSIGNED GET with
    a random string in X-GCS-Webhooks-Endpoint-Verification and expects exactly
    that string back as plain text. No signature check here on purpose: the GET
    carries no payload and changes no state, it only proves you own the URL. It is
    not a bypass of POST verification. Direct documents no such GET; answering it
    is harmless and lets one handler serve both platforms.
    """
    if not x_gcs_webhooks_endpoint_verification:
        return PlainTextResponse("Missing X-GCS-Webhooks-Endpoint-Verification header", status_code=400)
    return PlainTextResponse(
        x_gcs_webhooks_endpoint_verification,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.post(WEBHOOK_PATH)
async def worldline_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    raw_body: bytes = Depends(verified_worldline_body),
):
    # An empty body also has a valid signature (Direct's credential self-test
    # relies on that), but it is not an event.
    if not raw_body:
        raise HTTPException(status_code=400, detail="Empty body")

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    # The wire format is a bare object. Direct's docs render some samples inside
    # a one-element array; unwrap that defensively.
    if isinstance(event, list) and len(event) == 1:
        event = event[0]
    if (
        not isinstance(event, dict)
        or not isinstance(event.get("id"), str)
        or not isinstance(event.get("type"), str)
    ):
        raise HTTPException(status_code=400, detail="Not a Worldline webhook event")

    event_id: str = event["id"]
    event_type: str = event["type"]

    # The SDKs raise on apiVersion != "v1". Log and accept instead, so a future
    # version rollout doesn't 4xx every delivery and burn the retries.
    if event.get("apiVersion") != "v1":
        logger.warning("Unexpected apiVersion %s on event %s", event.get("apiVersion"), event_id)

    # Direct only: retry-count is unsigned. Observability, never auth or dedupe.
    retry_count = request.headers.get("retry-count")
    if retry_count:
        logger.info("Worldline delivery %s retry-count=%s", event_id, retry_count)

    # Duplicates are normal on both platforms: dedupe on the top-level id.
    if event_id in seen_event_ids:
        return {"received": True, "id": event_id, "duplicate": True}
    seen_event_ids.add(event_id)

    # Connect Configuration Center test events have an id prefixed with TEST.
    if event_id.startswith("TEST"):
        logger.info("Worldline test event %s (%s): not processed", event_id, event_type)
        return {"received": True, "id": event_id, "test": True}

    if event_type not in CONNECT_EVENTS and event_type not in DIRECT_EVENTS:
        logger.info("Ignoring unknown Worldline event type %s", event_type)
        return {"received": True, "id": event_id, "ignored": "unknown type"}

    # Respond 2xx immediately; processing runs after the response is sent.
    background_tasks.add_task(process_event, event)
    return {"received": True, "id": event_id, "type": event_type}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
