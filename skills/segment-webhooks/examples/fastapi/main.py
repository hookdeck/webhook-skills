import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def _matches(content: bytes, signature: str, secret: str) -> bool:
    """Compare hex(HMAC-SHA1(secret, content)) with the signature, timing-safe."""
    expected = hmac.new(secret.encode("utf-8"), content, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature, expected)


def first_batch_item(raw_body: bytes) -> Optional[bytes]:
    """Return the exact bytes of the first element of a JSON array body.

    Segment signs JSON.stringify(batch[0]). Slicing the original text avoids
    re-serializing with json.dumps, which formats numbers and Unicode
    differently from JavaScript.
    """
    text = raw_body.decode("utf-8")
    match = re.match(r"\s*\[\s*", text)
    if not match or text[match.end():match.end() + 1] == "]":
        return None
    _, end = json.JSONDecoder().raw_decode(text, match.end())
    return text[match.end():end].encode("utf-8")


def verify_segment_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Segment webhook signature.

    Segment sends X-Signature = hex(HMAC-SHA1(sharedSecret, body)). When batching
    is enabled the body is a JSON array, but Segment signs only the FIRST event,
    so a raw-body check alone fails for batches.
    """
    if not signature or not secret:
        return False

    # Single event: the signature covers the raw body
    if _matches(raw_body, signature, secret):
        return True

    # Batched delivery: Segment signs only the first event in the array.
    # Note that only that first event is authenticated by the signature.
    try:
        first = first_batch_item(raw_body)
    except ValueError:  # includes UnicodeDecodeError and JSONDecodeError
        return False
    return first is not None and _matches(first, signature, secret)


def handle_segment_event(event: dict) -> None:
    """Handle a single Segment spec call, dispatching on its `type`."""
    event_type = event.get("type")
    user = event.get("userId") or event.get("anonymousId")

    if event_type == "track":
        print(f'Track "{event.get("event")}" for {user}')
        # TODO: Trigger workflows, update usage counters, sync conversions

    elif event_type == "identify":
        print(f"Identify {user}: {event.get('traits')}")
        # TODO: Upsert the user in your database or CRM

    elif event_type == "page":
        path = (event.get("properties") or {}).get("path") or event.get("name")
        print(f"Page view: {path}")
        # TODO: Content analytics

    elif event_type == "screen":
        print(f"Screen view: {event.get('name')}")
        # TODO: Mobile analytics

    elif event_type == "group":
        print(f"Group {event.get('groupId')} for {event.get('userId')}")
        # TODO: Sync the account/organization

    elif event_type == "alias":
        print(f"Alias {event.get('previousId')} -> {event.get('userId')}")
        # TODO: Merge user records

    elif event_type == "delete":
        # Classic Webhooks destination only: user deletion request notification
        print(f"Delete request for {event.get('userId')}")
        # TODO: Start your data-deletion automation

    else:
        print(f"Unhandled Segment call type: {event_type}")


@app.post("/webhooks/segment")
async def segment_webhook(request: Request):
    secret = os.environ.get("SEGMENT_SHARED_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("x-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Signature header")

    # Raw body for signature verification - don't parse JSON first
    raw_body = await request.body()
    if not verify_segment_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Batching sends an array of events; otherwise a single event object
    events = payload if isinstance(payload, list) else [payload]
    for event in events:
        # Use event["messageId"] to de-duplicate retried deliveries
        if isinstance(event, dict):
            handle_segment_event(event)

    return {"received": True, "count": len(events)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
