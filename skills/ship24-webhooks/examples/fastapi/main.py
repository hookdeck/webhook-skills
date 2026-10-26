# Generated with: ship24-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# In-memory dedupe for the example. Use a shared store (Redis, a database unique key) in production.
processed_message_ids: set = set()


def verify_ship24_request(headers, configured=None) -> bool:
    """Ship24 does not sign payloads. Every webhook carries the account's Webhook Secret as
    "Authorization: Bearer <secret>". The configured value is the bare secret (a pasted
    "Bearer " prefix is stripped, as Hookdeck does). The scheme matches in any case; the
    secret is compared exactly, in constant time.

    A static shared credential authenticates the sender, not the body, and gives no replay
    protection (no signature, no timestamp): use HTTPS and rotate the secret if it leaks.
    """
    configured = configured if configured is not None else os.environ.get("SHIP24_WEBHOOK_SECRET")
    if not configured:
        return False  # never accept when unconfigured
    secret = re.sub(r"^bearer ", "", configured, flags=re.IGNORECASE).encode("utf-8")
    if not secret:
        return False  # a configured value of just "Bearer " must not match
    header = headers.get("authorization")
    if not header or header[:7].lower() != "bearer ":
        return False
    try:
        received = header[7:].encode("latin-1")  # HTTP headers are latin-1 on the wire
    except UnicodeEncodeError:
        return False
    # Compare bytes, never str: compare_digest raises TypeError on non-ASCII str.
    return bool(secret) and hmac.compare_digest(received, secret)


async def require_ship24_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read or parsed."""
    if not verify_ship24_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization bearer secret")


def handle_tracking(tracking: dict) -> None:
    topic = tracking["metadata"].get("topic")
    tracker = tracking.get("tracker") or {}

    if topic == "tracking/events":
        events = tracking.get("events") or []
        event = events[0] if events else {}
        print(f"Tracking update for {tracker.get('trackingNumber')}: {event.get('status')}")
        # TODO: compare event["occurrenceDatetime"] with the latest stored event before changing
        # shipment status, because messages can arrive out of order

    elif topic == "tracking/pod":
        data = tracking.get("data") or {}
        print(f"Proof of delivery for {tracker.get('trackingNumber')}: {data.get('status')}")
        # TODO: if data["status"] is "found", store data["content"]["text"] or download
        # data["content"]["downloadUrl"] (valid for 7 days)

    else:
        print(f"Unhandled topic: {topic}")


@app.post("/webhooks/ship24", dependencies=[Depends(require_ship24_secret)])
async def ship24_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    trackings = payload.get("trackings") if isinstance(payload, dict) else None
    if not isinstance(trackings, list) or not all(
        isinstance(t, dict) and isinstance(t.get("metadata"), dict) for t in trackings
    ):
        raise HTTPException(
            status_code=400, detail="Expected { trackings: [...] } with metadata on each item"
        )

    try:
        # trackings holds one item unless the account groups updates, so always loop.
        for tracking in trackings:
            message_id = tracking["metadata"].get("messageId")
            if message_id and message_id in processed_message_ids:
                print(f"Duplicate message {message_id}, skipping")
                continue
            handle_tracking(tracking)
            if message_id:
                processed_message_ids.add(message_id)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Ship24 message: {err}")
        raise HTTPException(status_code=500, detail="Handler error")  # Ship24 retries non-2xx

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
