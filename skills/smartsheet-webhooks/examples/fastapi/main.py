# Generated with: smartsheet-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()


def verify_smartsheet_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Smartsheet-Hmac-SHA256 = hex HMAC-SHA256 of the raw body, keyed with the
    webhook's sharedSecret. Compare case-insensitively."""
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature_header.strip().lower(), expected)


def handle_event(event: dict) -> None:
    kind = f"{event.get('objectType')}.{event.get('eventType')}"
    if kind == "row.created":
        print("Row created:", event.get("id"))
        # TODO: Fetch the row via the API (callbacks are "skinny") and process it
    elif kind == "row.updated":
        print("Row updated:", event.get("id"))
    elif kind == "row.deleted":
        print("Row deleted:", event.get("id"))
    elif kind == "cell.updated":
        print("Cell updated: row", event.get("rowId"), "column", event.get("columnId"))
    elif kind == "sheet.updated":
        print("Sheet updated:", event.get("id"))
    else:
        print(f"Unhandled event: {kind}")


@app.post("/webhooks/smartsheet")
async def smartsheet_webhook(request: Request):
    # 1. Verification handshake FIRST: Smartsheet sends it on enable and again
    #    about every 100 callbacks. Challenge requests may be unsigned, so echo
    #    the value before any signature check.
    challenge = request.headers.get("smartsheet-hook-challenge")
    if challenge:
        return JSONResponse(
            {"smartsheetHookResponse": challenge},
            status_code=200,
            headers={"Smartsheet-Hook-Response": challenge},
        )

    # 2. Verify the signature over the raw body (read bytes, don't use request.json())
    signature = request.headers.get("smartsheet-hmac-sha256")
    if not signature:
        return PlainTextResponse("Missing Smartsheet-Hmac-SHA256 header", status_code=400)
    raw_body = await request.body()
    if not verify_smartsheet_signature(raw_body, signature, os.getenv("SMARTSHEET_SHARED_SECRET")):
        return PlainTextResponse("Invalid signature", status_code=400)

    # 3. Parse and dispatch
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    if payload.get("newWebhookStatus"):
        # Status change callback (webhook automatically disabled or re-enabled)
        print("Webhook status changed:", payload["newWebhookStatus"])
    else:
        for event in payload.get("events", []):
            handle_event(event)

    # Any 200 acknowledges the callback
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
