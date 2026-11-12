# Generated with: coinbase-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Coinbase Developer Platform (CDP) webhooks v2 receiver.

CDP has no Python webhook-verification helper, so verify manually.
"""
import hashlib
import hmac
import json
import os
import re
import time
from typing import Any, Callable, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# CDP's reference implementation defaults to a 5-minute window. CDP retries up to
# 60 times with exponential backoff, so pair this with idempotency rather than tightening it.
MAX_AGE_SECONDS = 5 * 60

HEX_SHA256 = re.compile(r"^[0-9a-fA-F]{64}$")


def parse_signature_header(header: str) -> dict:
    """Parse `t=...,v0=...,h=...,v1=...` by key: part order is not guaranteed.

    `h` contains spaces (never commas), so split on commas, then on the first `=`.
    """
    parts = {}
    for segment in header.split(","):
        key, sep, value = segment.partition("=")
        if sep and key.strip():
            parts[key.strip()] = value.strip()
    return parts


def verify_coinbase_signature(
    raw_body: bytes,
    signature_header: str,
    get_header: Callable[[str], Optional[str]],
    secret: str,
    max_age_seconds: int = MAX_AGE_SECONDS,
    now: Optional[int] = None,
    scheme: str = "auto",
) -> tuple[bool, str]:
    """Verify a CDP webhook signature.

    v1 = hex HMAC-SHA256 over `{t}.{h}.{header_values}.{raw_body}`, where header_values are
    the values of the headers named in `h` (in order) joined with "." (missing header = "").
    v0 = hex HMAC-SHA256 over `{t}.{raw_body}`.
    v1 is used when both `v1=` and `h=` are present, otherwise v0. Pass scheme="v0" if a
    proxy in front of you rewrites a header named in `h`.
    """
    parts = parse_signature_header(signature_header)
    now = int(time.time()) if now is None else now

    t = parts.get("t", "")
    if not t.isascii() or not t.isdigit() or int(t) <= 0:
        return False, "Invalid timestamp"
    if abs(now - int(t)) > max_age_seconds:
        return False, "Timestamp outside tolerance"

    if scheme != "v0" and parts.get("v1") and parts.get("h"):
        h = parts["h"]
        header_values = ".".join(get_header(name.lower()) or "" for name in h.split(" ") if name)
        prefix = f"{t}.{h}.{header_values}.".encode("utf-8")
        provided = parts["v1"]
    elif parts.get("v0"):
        prefix = f"{t}.".encode("utf-8")
        provided = parts["v0"]
    else:
        return False, "No usable signature"

    if not HEX_SHA256.match(provided):
        return False, "Malformed signature"

    expected = hmac.new(secret.encode("utf-8"), prefix + raw_body, hashlib.sha256).hexdigest()
    if hmac.compare_digest(expected, provided.lower()):
        return True, ""
    return False, "Signature mismatch"


def pick(obj: Any, *keys: str) -> Any:
    """Return the first non-null value among `keys`."""
    if not isinstance(obj, dict):
        return None
    for key in keys:
        if obj.get(key) is not None:
            return obj[key]
    return None


def normalize_onchain_activity(body: dict) -> dict:
    """`onchain.activity.detected` has two contradictory documented bodies
    (enveloped camelCase and flat snake_case). Accept both."""
    d = body.get("data") if isinstance(body.get("data"), dict) else body
    return {
        "network": pick(d, "network", "networkId"),
        "contract_address": pick(d, "contract_address", "contractAddress"),
        "event_name": pick(d, "event_name", "eventName"),
        "transaction_hash": pick(d, "transaction_hash", "transactionHash"),
        "log_index": pick(d, "log_index", "logIndex"),
        "block_number": pick(d, "block_number", "blockNumber"),
        "parameters": pick(d, "parameters") or {"from": d.get("from"), "to": d.get("to"), "value": d.get("value")},
    }


# Demo-only idempotency store. Use a database unique constraint or Redis in production.
processed_events: set[str] = set()


def dedupe_key(event_type: Optional[str], body: dict, event_id_header: Optional[str]) -> Optional[str]:
    if event_id_header:
        return f"id:{event_id_header}"
    if body.get("eventID"):  # transfers (capital D)
        return f"id:{body['eventID']}"
    if body.get("eventId"):  # payment acceptance (lowercase d)
        return f"id:{body['eventId']}"
    if body.get("id"):
        return f"id:{body['id']}"
    if event_type and event_type.endswith(".activity.detected"):
        a = normalize_onchain_activity(body)
        if a["transaction_hash"] is not None and a["log_index"] is not None:
            return f"log:{a['transaction_hash']}:{a['log_index']}"
    return None


WALLET_TX_EVENTS = {
    "wallet.transaction.created",
    "wallet.transaction.signed",
    "wallet.transaction.broadcast",
    "wallet.transaction.replaced",
    "wallet.transaction.confirmed",
    "wallet.transaction.failed",
}
WALLET_SIGNING_EVENTS = {"wallet.typed_data.signed", "wallet.message.signed", "wallet.hash.signed"}
WALLET_DELEGATION_EVENTS = {"wallet.delegation.created", "wallet.delegation.revoked"}
ACTIVITY_EVENTS = {"onchain.activity.detected", "wallet.activity.detected"}
RAMP_EVENTS = {
    "onramp.transaction.created",
    "onramp.transaction.updated",
    "onramp.transaction.success",
    "onramp.transaction.failed",
    "offramp.transaction.created",
    "offramp.transaction.updated",
    "offramp.transaction.success",
    "offramp.transaction.failed",
}


def handle_event(event_type: Optional[str], body: dict) -> None:
    data = body.get("data") if isinstance(body.get("data"), dict) else {}

    if event_type in WALLET_TX_EVENTS:
        # Solana uses transaction_signature, not transaction_hash.
        tx = pick(body, "transaction_hash", "transaction_signature")
        print(f"{event_type}: {tx} ({body.get('address')} on {body.get('network')})")
    elif event_type == "wallet.transaction.pending":
        # EVM only: >30s in the mempool. Not a failure; decide whether to replace with higher gas.
        print(f"Pending since {body.get('pending_since')}: {body.get('transaction_hash')} "
              f"(max_fee_per_gas={body.get('max_fee_per_gas')}, "
              f"max_priority_fee_per_gas={body.get('max_priority_fee_per_gas')})")
    elif event_type in WALLET_SIGNING_EVENTS:
        print(f"{event_type} by {body.get('address')}")
    elif event_type in WALLET_DELEGATION_EVENTS:
        print(f"{event_type}: delegation {body.get('delegation_id')} for user {body.get('user_id')}")
    elif event_type in ACTIVITY_EVENTS:
        # One event type for every contract event (filtered by subscription labels).
        a = normalize_onchain_activity(body)
        print(f"{event_type}: {a['event_name']} on {a['contract_address']} ({a['network']}) "
              f"tx {a['transaction_hash']}#{a['log_index']}")
    elif event_type == "wallet.activity.multi":
        d = data or body
        # `value` is the RAW token amount: for 6-decimal USDC, "5000000" is $5.00.
        print(f"ERC-20 transfer {d.get('direction')} {d.get('matchedAddress')}: "
              f"raw value {d.get('value')} (tx {d.get('transactionHash')})")
    elif event_type in ("payments.transfers.quoted", "payments.transfers.processing"):
        # Best-effort intermediate events: may be skipped entirely.
        print(f"Transfer {data.get('transferId')} is {data.get('status')}")
    elif event_type == "payments.transfers.completed":
        print(f"Transfer {data.get('transferId')} completed: {data.get('targetAmount')} {data.get('targetAsset')}")
    elif event_type == "payments.transfers.failed":
        print(f"Transfer {data.get('transferId')} failed")
    elif event_type == "payments.transfers.expired":
        # The quote expired before execution. data.status stays "quoted", so key off the event type.
        print(f"Transfer {data.get('transferId')} quote expired at {data.get('expiresAt')}")
    elif event_type in RAMP_EVENTS:
        # Flat camelCase body; money fields may be strings or {currency, value} objects.
        print(f"{event_type}: {pick(body, 'transactionId', 'orderId')} status {body.get('status')}")
    else:
        print(f"Unhandled Coinbase CDP event type: {event_type}")


async def verified_coinbase_event(request: Request) -> dict:
    """FastAPI dependency: verify the raw body, then parse it."""
    secret = os.environ.get("COINBASE_WEBHOOK_SECRET")
    if not secret:
        print("COINBASE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # X-Hook0-Signature is a deprecated alias carrying the identical value.
    signature_header = request.headers.get("x-webhook-signature") or request.headers.get("x-hook0-signature")
    if not signature_header:
        raise HTTPException(status_code=400, detail="Missing signature header")

    raw_body = await request.body()  # raw bytes - never parse before verifying
    valid, reason = verify_coinbase_signature(raw_body, signature_header, request.headers.get, secret)
    if not valid:
        print(f"Coinbase webhook verification failed: {reason}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        body = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    return body


@app.post("/webhooks/coinbase")
async def coinbase_webhook(request: Request, body: dict = Depends(verified_coinbase_event)):
    # Route on the X-Event-Type header; fall back to the body (`type`, then `eventType`).
    event_type = request.headers.get("x-event-type") or body.get("type") or body.get("eventType")

    # Delivery is at-least-once: duplicates are expected.
    key = dedupe_key(event_type, body, request.headers.get("x-event-id"))
    if key and key in processed_events:
        return {"received": True, "duplicate": True}

    handle_event(event_type, body)
    if key:
        processed_events.add(key)

    # Acknowledge fast. In production, enqueue the event and process it asynchronously.
    return {"received": True, "type": event_type}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
