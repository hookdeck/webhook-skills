# Generated with: jobber-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()


def verify_jobber_signature(raw_body: bytes, signature_header: str | None, client_secret: str) -> bool:
    """Verify a Jobber webhook signature.

    Jobber sends `X-Jobber-Hmac-SHA256`: the base64 HMAC-SHA256 of the RAW request
    body, keyed with your app's OAuth client secret. The header is compared as a
    string (no base64 decoding). Both sides are encoded to bytes so a non-ASCII
    header returns False instead of raising TypeError.
    """
    if not signature_header or not client_secret:
        return False
    expected = base64.b64encode(
        hmac.new(client_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    )
    return hmac.compare_digest(signature_header.encode("utf-8"), expected)


def handle_event(event: dict) -> None:
    """Handle a Jobber webhook event.

    Payloads are thin: use ``itemId`` to fetch the object through the Jobber
    GraphQL API. Delivery is at-least-once, so dedupe (e.g. on accountId +
    itemId + topic + occurredAt).
    """
    topic = event.get("topic")

    if topic == "CLIENT_CREATE":
        print(f"Client created: {event.get('itemId')}")
        # TODO: query the client by itemId via GraphQL and sync it to your CRM
    elif topic == "INVOICE_UPDATE":
        print(f"Invoice updated: {event.get('itemId')}")
        # TODO: query the invoice by itemId via GraphQL and reconcile status/payments
    elif topic == "APP_CONNECT":
        print(f"App connected: {event.get('accountId')}")
        # TODO: store the account link for this accountId
    elif topic == "APP_DISCONNECT":
        print(f"App disconnected: {event.get('accountId')}")
        # TODO: revoke tokens and clean up data for this accountId (required for Marketplace apps)
    else:
        print(f"Unhandled topic: {topic} ({event.get('itemId')})")


@app.post("/webhooks/jobber")
async def jobber_webhook(request: Request):
    # Read the RAW body for signature verification (do NOT parse first).
    raw_body = await request.body()
    signature = request.headers.get("x-jobber-hmac-sha256")

    if not verify_jobber_signature(raw_body, signature, os.environ.get("JOBBER_CLIENT_SECRET", "")):
        print("Jobber signature verification failed")
        return Response(content="Invalid signature", status_code=401)

    try:
        payload = json.loads(raw_body)
    except ValueError:
        return Response(content="Invalid JSON", status_code=400)

    event = payload.get("data", {}).get("webHookEvent") if isinstance(payload, dict) else None
    if not isinstance(event, dict) or not event.get("topic"):
        return Response(content="Missing webHookEvent", status_code=400)

    handle_event(event)

    # Jobber expects a response within 1 second: do heavy work asynchronously.
    return Response(content="OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
