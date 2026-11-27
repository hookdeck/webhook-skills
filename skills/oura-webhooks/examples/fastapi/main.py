# Generated with: oura-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()


def verify_oura_signature(
    raw_body: bytes, signature: Optional[str], timestamp: Optional[str], client_secret: str
) -> bool:
    """Verify an Oura webhook signature.

    HMAC-SHA256 over (x-oura-timestamp + raw body), keyed with the client secret,
    hex-encoded and UPPERCASED, compared timing-safely to the x-oura-signature header.
    """
    if not signature or not timestamp:
        return False

    expected = hmac.new(
        client_secret.encode("utf-8"),
        timestamp.encode("utf-8") + raw_body,
        hashlib.sha256,
    ).hexdigest().upper()

    return hmac.compare_digest(expected, signature)


@app.get("/webhooks/oura")
async def oura_handshake(
    verification_token: Optional[str] = None, challenge: Optional[str] = None
):
    """Subscription handshake (GET).

    Oura calls this when you create a subscription.
    """
    if verification_token and verification_token == os.environ.get("OURA_VERIFICATION_TOKEN"):
        # Echo the challenge back as JSON to activate the subscription
        return {"challenge": challenge}

    raise HTTPException(status_code=401, detail="Invalid verification token")


@app.post("/webhooks/oura")
async def oura_webhook(request: Request):
    """Event delivery (POST). Uses the raw body for signature verification."""
    raw_body = await request.body()
    signature = request.headers.get("x-oura-signature")
    timestamp = request.headers.get("x-oura-timestamp")

    # Verify the signature before trusting the payload
    if not verify_oura_signature(
        raw_body, signature, timestamp, os.environ.get("OURA_CLIENT_SECRET", "")
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the (thin) payload after verification
    payload = json.loads(raw_body)
    event_type = payload.get("event_type")
    data_type = payload.get("data_type")
    object_id = payload.get("object_id")
    event_time = payload.get("event_time")
    user_id = payload.get("user_id")

    print(f"Received {event_type} {data_type} for user {user_id} (object {object_id})")

    # Dispatch on data_type. Payloads are thin — fetch the full record via the API
    # using object_id, e.g. GET /v2/usercollection/{data_type}/{object_id}.
    if data_type == "sleep":
        print(f"Sleep {event_type} at {event_time}")
        # Your code: fetch GET /v2/usercollection/sleep/{object_id}
    elif data_type == "daily_sleep":
        print(f"Daily sleep summary {event_type}")
        # Your code: fetch GET /v2/usercollection/daily_sleep/{object_id}
    elif data_type == "daily_readiness":
        print(f"Daily readiness {event_type}")
        # Your code: fetch GET /v2/usercollection/daily_readiness/{object_id}
    elif data_type == "daily_activity":
        print(f"Daily activity {event_type}")
        # Your code: fetch GET /v2/usercollection/daily_activity/{object_id}
    elif data_type == "workout":
        print(f"Workout {event_type}")
        # Your code: fetch GET /v2/usercollection/workout/{object_id}
    else:
        print(f"Unhandled data_type: {data_type}")

    # Return 200 to acknowledge receipt
    return JSONResponse({"received": True})


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
