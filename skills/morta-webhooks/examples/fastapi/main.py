# Generated with: morta-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import logging
import os
import re
import time

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Optional replay window in seconds. Off by default (0): retries and replays, including
# Hookdeck's, carry the original timestamp, so a window would reject late redeliveries.
# Set MORTA_WEBHOOK_TOLERANCE_SECONDS to a positive whole number to opt in; any other value is
# treated as 0, with a warning.
_warned_invalid_tolerance = False


def timestamp_tolerance_seconds() -> int:
    global _warned_invalid_tolerance
    raw = (os.getenv("MORTA_WEBHOOK_TOLERANCE_SECONDS") or "").strip()
    if not raw:
        return 0
    if not (raw.isascii() and raw.isdigit()):
        if not _warned_invalid_tolerance:
            logging.getLogger(__name__).warning(
                "MORTA_WEBHOOK_TOLERANCE_SECONDS=%r is not a whole number of seconds; the timestamp check is off",
                raw,
            )
            _warned_invalid_tolerance = True
        return 0
    return int(raw)


timestamp_tolerance_seconds()  # surface an invalid value at startup

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_morta_webhook(
    raw_body: bytes,
    header: str | None,
    secret: str,
    tolerance: int | None = None,
    now: float | None = None,
) -> bool:
    """Verify a Morta webhook signature.

    Header: ``Morta-Signature: t=<unix seconds>,v1=<hex>``
    v1 = hex HMAC-SHA256 over ``<t>.<raw body>``, keyed with the hub signing secret as UTF-8 text.
    More than one v1 may be present (key rotation): any match is enough. Other keys are ignored.
    """
    if not header or not secret:
        return False
    pairs = [part.strip().split("=", 1) for part in header.split(",") if "=" in part]
    # `t` is signed exactly as it appears in the header: keep it a string
    t = next((v.strip() for k, v in pairs if k.strip() == "t"), None)
    # Validate the format (64 hex chars) before comparing; skip other keys such as v0
    signatures = [
        v.strip().lower()
        for k, v in pairs
        if k.strip() == "v1" and HEX_SHA256.fullmatch(v.strip())
    ]
    if not t or not signatures:
        return False

    # Opt-in replay window (`t` is Unix seconds)
    if tolerance is None:
        tolerance = timestamp_tolerance_seconds()
    if tolerance > 0:
        if not (t.isascii() and t.isdigit()):
            return False
        if abs((time.time() if now is None else now) - int(t)) > tolerance:
            return False

    expected = hmac.new(
        secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
    ).hexdigest().encode("ascii")
    # Compare bytes, never str
    return any(hmac.compare_digest(sig.encode("ascii"), expected) for sig in signatures)


def parse_change(change) -> dict:
    """`change` is a JSON-encoded string (or null): parse it a second time, tolerating bad data."""
    if not isinstance(change, str):
        return {}
    try:
        parsed = json.loads(change)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def handle_event(body: dict) -> None:
    """Dispatch on the body's `event` field. Every field is untrusted: check its type before use."""
    event = body.get("event")
    resource_id = body.get("resourceId")
    resource_id = resource_id if isinstance(resource_id, str) else "unknown"
    context = body.get("context")
    context = context if isinstance(context, dict) else {}
    change = parse_change(body.get("change"))

    if event == "table.row_created":
        rows = context.get("rows")
        added = change.get("added")
        if not isinstance(added, int) or isinstance(added, bool):
            added = len(rows) if isinstance(rows, list) else 0
        print(f"Table {resource_id}: {added} row(s) created")
    elif event == "table.row_updated":
        print(f"Table {resource_id}: row(s) updated")
    elif event == "project.created":
        print(f"Hub created: {resource_id}")
    elif event == "project.duplication_failed":
        error = change.get("error")
        print(f"Hub duplication failed for {resource_id}: {error if isinstance(error, str) else 'unknown error'}")
    elif event == "member.created":
        print(f"Member added to hub {resource_id}")
    elif event == "process.response_submitted":
        print(f"Document response submitted: {resource_id}")
    else:
        print(f"Unhandled event type: {event if isinstance(event, str) else 'missing'}")
    # TODO: persist / forward. `id` (the event's unique public ID) is a good idempotency key.


@app.post("/webhooks/morta")
async def morta_webhook(request: Request):
    # Read the raw bytes BEFORE parsing - the signature is over the exact body
    raw_body = await request.body()
    header = request.headers.get("morta-signature")
    secret = os.environ.get("MORTA_WEBHOOK_SECRET")

    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not header or not verify_morta_webhook(raw_body, header, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification, and treat the result as untrusted
    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    handle_event(body)

    # Any 2xx acknowledges, and Morta expects it within 10 seconds
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
