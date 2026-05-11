import os
import hmac
import hashlib
import base64
import json
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

hubspot_client_secret = os.environ.get("HUBSPOT_CLIENT_SECRET", "")

MAX_AGE_MS = 5 * 60 * 1000  # 5 minutes


def verify_hubspot_webhook(
    method: str,
    uri: str,
    raw_body: bytes,
    timestamp: str,
    signature: str,
    secret: str,
) -> bool:
    """Verify a HubSpot v3 webhook signature.

    signed_content = method + uri + raw_body + timestamp
    signature      = base64(HMAC-SHA256(signed_content, app_client_secret))
    """
    if not signature or not timestamp or not secret:
        return False

    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False

    if abs(int(time.time() * 1000) - ts) > MAX_AGE_MS:
        return False

    body = raw_body.decode("utf-8")
    signed_content = f"{method}{uri}{body}{timestamp}"

    expected = base64.b64encode(
        hmac.new(
            secret.encode("utf-8"),
            signed_content.encode("utf-8"),
            hashlib.sha256,
        ).digest()
    ).decode("utf-8")

    return hmac.compare_digest(expected, signature)


def _request_uri(request: Request) -> str:
    """Reconstruct the URI HubSpot signed, honoring X-Forwarded-* when present."""
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto")
    host = forwarded_host or request.headers.get("host") or request.url.netloc
    proto = forwarded_proto or request.url.scheme
    path = request.url.path
    query = request.url.query
    if query:
        return f"{proto}://{host}{path}?{query}"
    return f"{proto}://{host}{path}"


@app.post("/webhooks/hubspot")
async def hubspot_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-hubspot-signature-v3")
    timestamp = request.headers.get("x-hubspot-request-timestamp")
    uri = _request_uri(request)

    if not verify_hubspot_webhook(
        method=request.method,
        uri=uri,
        raw_body=raw_body,
        timestamp=timestamp or "",
        signature=signature or "",
        secret=hubspot_client_secret,
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        parsed = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    events = parsed if isinstance(parsed, list) else [parsed]

    for event in events:
        subscription_type = event.get("subscriptionType")

        if subscription_type == "contact.creation":
            print(f"New contact: {event.get('objectId')}")
            # TODO: sync to CRM, trigger welcome workflow, etc.

        elif subscription_type == "contact.propertyChange":
            print(
                "Contact property changed:",
                event.get("objectId"),
                event.get("propertyName"),
                "->",
                event.get("propertyValue"),
            )

        elif subscription_type == "contact.deletion":
            print(f"Contact deleted: {event.get('objectId')}")

        elif subscription_type == "company.creation":
            print(f"New company: {event.get('objectId')}")

        elif subscription_type == "company.propertyChange":
            print(
                "Company property changed:",
                event.get("objectId"),
                event.get("propertyName"),
            )

        elif subscription_type == "deal.creation":
            print(f"New deal: {event.get('objectId')}")

        elif subscription_type == "deal.propertyChange":
            print(
                "Deal property changed:",
                event.get("objectId"),
                event.get("propertyName"),
                "->",
                event.get("propertyValue"),
            )

        elif subscription_type == "ticket.creation":
            print(f"New ticket: {event.get('objectId')}")

        else:
            print(f"Unhandled event: {subscription_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
