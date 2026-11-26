# Generated with: worldpay-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""
Access Worldpay event webhooks: the Event-Signature header

    Event-Signature: {keyId}/{hashFunction}/{signature}[,{keyId}/{hashFunction}/{signature}...]

    keyId         numeric reference to the shared secret that signed the message
    hashFunction  SHA256 (the only value Worldpay supports today)
    signature     hex HMAC of the raw request body, keyed with that shared secret

No timestamp, no nonce, no URL or headers in the signed content, so there is no
replay window to check: dedupe on eventId instead.

During key renewal Worldpay sends TWO comma-separated signatures, in no fixed
order ("always use the keyId"). Accept the request if ANY entry verifies with
the secret held for its keyId.

Signing is opt-in: ask your Worldpay Implementation Manager to enable the
Event-Signature header. This handler rejects unsigned requests with 400.

WPG (Corporate Gateway) XML order notifications are a different family:
unsigned text/xml that must be answered with HTTP 200 and the literal body
"[OK]". They don't belong on this route. Behind Hookdeck, the WORLDPAY source
answers "[OK]" for you.
"""

import hashlib
import hmac
import json
import logging
import os
import re
from typing import NamedTuple

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("worldpay_webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Worldpay Webhooks - FastAPI Example")

SECRET_ENV_PREFIX = "WORLDPAY_WEBHOOK_SECRET_"
KEY_ID_PATTERN = re.compile(r"[0-9]+")


def load_secrets() -> dict[str, str]:
    """keyId -> shared secret, from WORLDPAY_WEBHOOK_SECRET_<keyId> env vars.

    Read on every request, so a missing secret fails closed per request instead
    of crashing at import. Hold one secret normally and two during key renewal.
    """
    secrets: dict[str, str] = {}
    for name, value in os.environ.items():
        if not name.startswith(SECRET_ENV_PREFIX) or not value:
            continue
        key_id = name[len(SECRET_ENV_PREFIX):]
        if KEY_ID_PATTERN.fullmatch(key_id):
            secrets[key_id] = value
    return secrets


class SignatureEntry(NamedTuple):
    key_id: str
    hash_function: str
    signature: str


def parse_event_signature(header: str | None) -> list[SignatureEntry]:
    """Split Event-Signature into entries. Malformed entries are skipped, never raised on."""
    if not header:
        return []
    entries = []
    for raw in header.split(","):
        parts = [p.strip() for p in raw.strip().split("/")]
        if len(parts) != 3 or any(not p for p in parts):
            continue
        entries.append(SignatureEntry(*parts))
    return entries


# Event-Signature hashFunction -> hashlib constructor. Anything else is skipped
# rather than mapped to a guess.
HASH_FUNCTIONS = {"SHA256": hashlib.sha256}


def verify_worldpay_signature(raw_body: bytes, header: str | None, secrets: dict[str, str]) -> bool:
    """Verify Event-Signature against the exact bytes Worldpay sent."""
    # The header is attacker-controlled and may repeat entries: compute each
    # (keyId, hashFunction) digest once and reuse it.
    digests: dict[tuple[str, str], str] = {}
    for key_id, hash_function, signature in parse_event_signature(header):
        name = hash_function.upper()
        digestmod = HASH_FUNCTIONS.get(name)
        secret = secrets.get(key_id)
        if digestmod is None or secret is None:
            continue
        memo_key = (key_id, name)
        if memo_key not in digests:
            digests[memo_key] = hmac.new(secret.encode("utf-8"), raw_body, digestmod).hexdigest()
        # Hex: compare lower-case on both sides, the docs never promise a case.
        expected = digests[memo_key].encode("utf-8")
        received = signature.lower().encode("utf-8")
        if len(received) == len(expected) and hmac.compare_digest(received, expected):
            return True
    return False


# Event types from the Access Worldpay events OpenAPI spec, grouped by
# eventDetails.classification. Which ones you receive depends on your business
# line, payment methods and what your Implementation Manager enabled.
WORLDPAY_EVENTS: dict[str, list[str]] = {
    "payment": [
        "sentForAuthorization", "authorized", "sentForSettlement", "settled", "settlementFailed",
        "settlementInstructed", "settlementRejected", "cancelled", "cancelledByCustomer", "error",
        "expired", "requestExpired", "refused", "sentForRefund", "refunded", "refundFailed",
        "chargedBack", "tokenCreated", "topUpAccepted", "topUpRejected",
    ],
    "payout": ["requested", "pending", "approved", "refused", "disbursed"],
    "chargeback": ["informationRequested"],
}

# `type` alone is NOT unique: `refused` is both a payment and a payout event.
# Route on the (classification, type) pair.
KNOWN_EVENTS = {
    (classification, event_type)
    for classification, types in WORLDPAY_EVENTS.items()
    for event_type in types
}

# Demo-only dedupe store. Use a database unique constraint on eventId in production.
seen_event_ids: set[str] = set()

PAYMENT_NOT_COMPLETED = {"refused", "error", "expired", "cancelled", "cancelledByCustomer", "requestExpired"}


def process_event(event: dict) -> dict:
    """Runs AFTER the 200 has been sent.

    Worldpay waits 10 seconds for the 200, and an unacknowledged event delays
    (or loses) the events queued behind it.
    """
    details = event.get("eventDetails") or {}
    amount = details.get("amount") or {}
    classification = details.get("classification")
    event_type = details.get("type")
    summary = {
        "eventId": event.get("eventId"),
        # eventTimestamp has no timezone designator in the spec example: parse leniently.
        "eventTimestamp": event.get("eventTimestamp"),
        "classification": classification,
        "type": event_type,
        "transactionReference": details.get("transactionReference"),
        # Not present on every event (the payout schemas omit it).
        "downstreamReference": details.get("downstreamReference"),
        # Minor units: {"value": 250, "currencyCode": "GBP"} is GBP 2.50.
        "amount": amount.get("value"),
        "currency": amount.get("currencyCode"),
    }

    match (classification, event_type):
        case ("payment", "authorized"):
            action = "payment authorized: funds reserved"
        case ("payment", "sentForSettlement" | "settled"):
            action = "payment settling: fulfil the order"
        case ("payment", t) if t in PAYMENT_NOT_COMPLETED:
            # `error` is also used for payout-related failures.
            action = "payment did not complete"
        case ("payment", "sentForRefund"):
            # Basic disbursement payouts also arrive as payment/sentForRefund.
            action = "refund (or basic disbursement payout) requested"
        case ("payment", "refunded" | "refundFailed"):
            action = "refund outcome"
        case ("payment", "chargedBack") | ("chargeback", "informationRequested"):
            action = "dispute: gather evidence"
        case ("payment", "tokenCreated"):
            # eventDetails shape varies by payment method (Card, Klarna, iDEAL, SEPA).
            action = "token created"
        case ("payout", "refused"):
            action = "payout refused"
        case ("payout", "approved" | "disbursed"):
            action = "payout progressing"
        case _:
            action = "worldpay event received"

    logger.info("Worldpay %s %s", action, summary)
    return {**summary, "action": action}


def _error(status: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": message})


@app.post("/webhooks/worldpay")
async def worldpay_webhook(request: Request, background_tasks: BackgroundTasks):
    secrets = load_secrets()
    if not secrets:
        # Fail closed: never skip verification because the secret is missing.
        logger.error("No WORLDPAY_WEBHOOK_SECRET_<keyId> set: rejecting webhook")
        return _error(500, "Webhook secret not configured")

    # Worldpay's documented contract: no signature (when set up for HMAC) -> 400,
    # signature mismatch -> discard the body and return 400. Not 401/403.
    header = request.headers.get("event-signature")
    if not header:
        return _error(400, "Missing Event-Signature header")

    # Raw bytes: the HMAC covers exactly what Worldpay sent, and reading the body
    # directly sidesteps the application/vnd.worldpay.events-v1.hal+json
    # Content-Type that JSON-only parsers ignore.
    raw_body = await request.body()
    if not verify_worldpay_signature(raw_body, header, secrets):
        return _error(400, "Invalid signature")

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return _error(400, "Invalid JSON")
    details = event.get("eventDetails") if isinstance(event, dict) else None
    if not isinstance(event, dict) or not isinstance(event.get("eventId"), str) or not isinstance(details, dict):
        return _error(400, "Not an Access Worldpay event")

    event_id = event["eventId"]
    # Worldpay retries until it gets a 200 (for up to a week): duplicates are normal.
    if event_id in seen_event_ids:
        return {"received": True, "eventId": event_id, "duplicate": True}
    seen_event_ids.add(event_id)

    classification = details.get("classification")
    event_type = details.get("type")
    if (classification, event_type) not in KNOWN_EVENTS:
        logger.info("Ignoring unknown Worldpay event %s:%s", classification, event_type)
        return {"received": True, "eventId": event_id, "ignored": "unknown event"}

    # Acknowledge first; BackgroundTasks runs after the response is sent.
    background_tasks.add_task(process_event, event)
    return {"received": True, "eventId": event_id, "classification": classification, "type": event_type}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
