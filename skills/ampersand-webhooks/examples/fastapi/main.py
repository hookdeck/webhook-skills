# Generated with: ampersand-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Ampersand Webhook Handler")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok"}


def handle_notification(notification_type: str, data: dict) -> None:
    """Notifications: {"notificationType": "...", "data": {...}}."""
    if notification_type in ("installation.created", "installation.updated", "installation.deleted"):
        print(f"Installation event {notification_type}: {data.get('installationId')} ({data.get('groupRef')})")
    elif notification_type in (
        "connection.created", "connection.refreshed", "connection.updated", "connection.deleted"
    ):
        print(f"Connection event {notification_type}: {data.get('connectionId')} ({data.get('provider')})")
    elif notification_type == "connection.error":
        print(f"Connection error: {data.get('connectionId')} {data.get('errors')}")
    elif notification_type in ("read.backfill.done", "read.triggered.done"):
        print(f"Read finished ({notification_type}): {data.get('installationId')} {data.get('objectName')}")
    elif notification_type in ("read.backfill.error", "read.triggered.error", "read.schedule.paused"):
        print(f"Read problem ({notification_type}): {data.get('installationId')} {data.get('objectName')}")
    elif notification_type == "write.async.done":
        print(f"Async write done: {data.get('installationId')} {data.get('objectName')}")
    elif notification_type in (
        "subscribe.create.success", "subscribe.update.success", "subscribe.delete.success",
        "subscribe.create.error", "subscribe.update.error", "subscribe.delete.error",
    ):
        print(f"Subscribe event {notification_type}: {data.get('installationId')} {data.get('objectName')}")
    elif notification_type == "destination.webhook.disabled":
        print(f"Webhook destination disabled: {data.get('destinationId')} {data.get('url')}")
    elif notification_type == "destination.delivery.error":
        print(f"Delivery failed: {data.get('destinationId')} {data.get('error')}")
    else:
        print(f"Unhandled notification type: {notification_type}")


def handle_result(message: dict) -> None:
    """Read / subscribe results: {"action": "...", "groupRef": ..., "result": [...], "resultInfo": {...}}."""
    result_info = message.get("resultInfo") or {}
    print(
        f"Received {message.get('action')} result: {message.get('groupRef')} "
        f"{message.get('objectName')} ({result_info.get('numRecords')} records)"
    )
    if result_info.get("type") == "url":
        # A record over 300KB is not inlined: GET resultInfo.downloadUrl within 15 minutes.
        print("Result is too large to inline, download it from resultInfo.downloadUrl")
        return
    for record in message.get("result") or []:
        # record["fields"] / record["mappedFields"] / record["raw"] (subscribe: record["subscribeEventType"])
        print(f"Record: {(record.get('fields') or {}).get('id') or (record.get('raw') or {}).get('id')}")


@app.post("/webhooks/ampersand")
async def ampersand_webhook(
    request: Request,
    svix_id: str = Header(None),
    svix_timestamp: str = Header(None),
    svix_signature: str = Header(None),
):
    """Receive and verify an Ampersand webhook (delivered via Svix)."""
    secret = os.environ.get("AMPERSAND_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("Invalid webhook secret configuration")
        raise HTTPException(status_code=500, detail="Server configuration error")

    if not all([svix_id, svix_timestamp, svix_signature]):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify against the RAW body (any content type) — never a re-serialized payload.
    body = await request.body()
    try:
        # Decodes the secret, enforces a fixed 5-minute timestamp window and checks every
        # v1 entry in constant time. As of svix 2.x it returns None.
        Webhook(secret).verify(
            body,
            {
                "svix-id": svix_id,
                "svix-timestamp": svix_timestamp,
                "svix-signature": svix_signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:  # ValueError: e.g. non-ASCII header values
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        print(f"Webhook verification failed: {err}")
        raise HTTPException(status_code=400, detail=detail)

    # Verified — only now is it safe to parse.
    try:
        message = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(message, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Dispatch on notificationType when present, otherwise treat it as a read/subscribe result.
    notification_type = message.get("notificationType")
    if isinstance(notification_type, str):
        data = message.get("data")
        handle_notification(notification_type, data if isinstance(data, dict) else {})
        return JSONResponse(content={"success": True, "type": notification_type}, status_code=200)

    handle_result(message)
    return JSONResponse(content={"success": True, "type": message.get("action") or "read"}, status_code=200)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
