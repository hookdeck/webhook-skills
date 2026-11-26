# Generated with: asana-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Response

load_dotenv()

app = FastAPI()

asana_secret = os.environ.get("ASANA_WEBHOOK_SECRET")


def verify_asana_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify an Asana webhook signature.

    Asana signs each delivery with a hex HMAC-SHA256 of the RAW request body,
    keyed with the secret captured during the handshake.
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    # Timing-safe comparison.
    return hmac.compare_digest(signature_header, expected)


def handle_asana_event(event: dict) -> None:
    """Dispatch a single compact Asana event.

    Events name what changed; fetch full details via the API using resource.gid.
    """
    resource = event.get("resource") or {}
    resource_type = resource.get("resource_type")
    gid = resource.get("gid")
    action = event.get("action")

    if action == "added":
        print(f"Added {resource_type} {gid}")
        # Your code: Sync the new resource into your system.

    elif action == "changed":
        change = event.get("change") or {}
        print(f"Changed {resource_type} {gid} (field: {change.get('field')})")
        # Your code: Fetch the resource and update your mirror.

    elif action == "removed":
        parent = event.get("parent") or {}
        print(f"Removed {resource_type} {gid} from parent {parent.get('gid')}")
        # Your code: Update parent membership.

    elif action == "deleted":
        print(f"Deleted {resource_type} {gid}")
        # Your code: Soft-delete or archive in your system.

    elif action == "undeleted":
        print(f"Undeleted {resource_type} {gid}")
        # Your code: Restore in your system.

    else:
        print(f"Unhandled action: {action}")


@app.post("/webhooks/asana")
async def asana_webhook(request: Request):
    # Read the raw body once; needed for signature verification.
    raw_body = await request.body()
    hook_secret = request.headers.get("x-hook-secret")
    signature = request.headers.get("x-hook-signature")

    # --- Phase 1: Handshake ---
    # On creation Asana sends X-Hook-Secret and no signature. Echo it back with 200
    # and store it for verifying future deliveries.
    if hook_secret:
        # Your code: Persist `hook_secret` keyed by the webhook. This example verifies
        # against ASANA_WEBHOOK_SECRET from the environment instead.
        print("Handshake received; echoing X-Hook-Secret")
        return Response(status_code=200, headers={"X-Hook-Secret": hook_secret})

    # --- Phase 2: Event delivery ---
    if not verify_asana_signature(raw_body, signature, asana_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = json.loads(raw_body)
    events = payload.get("events", [])

    # Heartbeats arrive as an empty events array.
    if not events:
        print("Heartbeat received")
        return {"received": True}

    for event in events:
        handle_asana_event(event)

    # Acknowledge quickly (Asana times out after 10s). Do heavy work async.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
