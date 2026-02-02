import os
import json
import hmac
import hashlib
import base64
import time
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

webhook_secret = os.environ.get("RESEND_WEBHOOK_SECRET")


def verify_svix_signature(
    payload: bytes, headers: dict, secret: str, tolerance: int = 300
) -> bool:
    """
    Verify Svix signature used by Resend webhooks.

    Args:
        payload: Raw request body as bytes
        headers: Request headers dict
        secret: Webhook signing secret (whsec_...)
        tolerance: Maximum age in seconds (default 5 minutes)

    Returns:
        True if signature is valid, False otherwise
    """
    msg_id = headers.get("svix-id")
    msg_timestamp = headers.get("svix-timestamp")
    msg_signature = headers.get("svix-signature")

    # Check required headers
    if not all([msg_id, msg_timestamp, msg_signature]):
        return False

    # Check timestamp tolerance (prevent replay attacks)
    try:
        timestamp = int(msg_timestamp)
        now = int(time.time())
        if abs(now - timestamp) > tolerance:
            return False
    except ValueError:
        return False

    # Remove 'whsec_' prefix and decode base64 secret
    if secret.startswith("whsec_"):
        secret = secret[6:]
    secret_bytes = base64.b64decode(secret)

    # Create signed content
    signed_content = f"{msg_id}.{msg_timestamp}.{payload.decode()}"

    # Compute expected signature
    expected_sig = base64.b64encode(
        hmac.new(secret_bytes, signed_content.encode(), hashlib.sha256).digest()
    ).decode()

    # Check against provided signatures (may have multiple versions)
    for sig in msg_signature.split():
        if sig.startswith("v1,"):
            provided_sig = sig[3:]  # Remove "v1," prefix
            if hmac.compare_digest(provided_sig, expected_sig):
                return True

    return False


@app.post("/webhooks/resend")
async def resend_webhook(request: Request):
    # Get the raw body for signature verification
    payload = await request.body()

    # Get Svix headers
    headers = {
        "svix-id": request.headers.get("svix-id"),
        "svix-timestamp": request.headers.get("svix-timestamp"),
        "svix-signature": request.headers.get("svix-signature"),
    }

    # Check for required headers
    if not all(
        [headers["svix-id"], headers["svix-timestamp"], headers["svix-signature"]]
    ):
        raise HTTPException(status_code=400, detail="Missing webhook signature headers")

    # Verify signature
    if not verify_svix_signature(payload, headers, webhook_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the event
    try:
        event = json.loads(payload)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # Handle the event based on type
    event_type = event.get("type")
    data = event.get("data", {})

    if event_type == "email.sent":
        print(f"Email sent: {data.get('email_id')}")
        # TODO: Update email status in your database

    elif event_type == "email.delivered":
        print(f"Email delivered: {data.get('email_id')}")
        # TODO: Mark email as delivered, track delivery metrics

    elif event_type == "email.delivery_delayed":
        print(f"Email delivery delayed: {data.get('email_id')}")
        # TODO: Monitor for delivery issues

    elif event_type == "email.bounced":
        print(f"Email bounced: {data.get('email_id')}")
        # TODO: Handle bounce, possibly remove from mailing list

    elif event_type == "email.complained":
        print(f"Email marked as spam: {data.get('email_id')}")
        # TODO: Unsubscribe user, prevent future sends

    elif event_type == "email.opened":
        print(f"Email opened: {data.get('email_id')}")
        # TODO: Track engagement metrics

    elif event_type == "email.clicked":
        print(f"Email link clicked: {data.get('email_id')}")
        # TODO: Track click-through rates

    elif event_type == "email.received":
        print(f"Inbound email received: {data.get('email_id')}")
        # TODO: Process inbound email (call API to get body/attachments)
        # import resend
        # resend.api_key = os.environ.get("RESEND_API_KEY")
        # email = resend.Emails.Receiving.get(data.get('email_id'))

    else:
        print(f"Unhandled event type: {event_type}")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
