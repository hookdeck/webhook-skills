# Generated with: plunk-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The webhook step's method is a literal verb chosen by the user (default POST).
WEBHOOK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_plunk_request(headers, secret: Optional[str] = None, header_name: Optional[str] = None) -> bool:
    """Plunk does not sign webhooks. You add a secret header on the workflow's webhook step;
    the header name is yours (PLUNK_WEBHOOK_HEADER, default Authorization) and the expected
    value is the WHOLE header value (PLUNK_WEBHOOK_SECRET), including any "Bearer " prefix.
    No prefix is stripped or parsed.
    """
    secret = secret if secret is not None else os.environ.get("PLUNK_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PLUNK_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_plunk_secret(request: Request) -> None:
    """FastAPI dependency: reject the request (any method) before the body is read."""
    if not verify_plunk_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing secret header")


def classify_event(event) -> Optional[str]:
    """The wire has no Plunk-defined event-name field: the trigger (email.bounce, ...) only
    selects the workflow. For the default body we infer the kind from the documented fields
    of body.event. A custom body replaces the default entirely, so this may be None.
    """
    if not isinstance(event, dict):
        return None
    if "bouncedAt" in event or "bounceType" in event:
        return "email.bounce"
    if "complainedAt" in event:
        return "email.complaint"
    if "clickedAt" in event:
        return "email.click"
    if "openedAt" in event:
        return "email.open"
    if "deliveredAt" in event:
        return "email.delivery"
    if "sentAt" in event:
        return "email.sent"
    if "spfVerdict" in event or "recipients" in event:
        return "email.received"
    if "segmentId" in event:
        return "segment"
    return None


def handle_event(payload) -> None:
    # Default body: {contact, workflow, execution, event}. Custom bodies are plain JSON.
    body = payload if isinstance(payload, dict) else {}
    contact = body.get("contact") if isinstance(body.get("contact"), dict) else {}
    workflow = body.get("workflow") if isinstance(body.get("workflow"), dict) else {}
    event = body.get("event")
    email = contact.get("email")
    kind = classify_event(event)

    if kind == "email.bounce":
        print(f"Email bounced ({event.get('bounceType')}) for {email}")
        # TODO: mark the address undeliverable (event["emailId"], event.get("transientBounce"))

    elif kind == "email.complaint":
        print(f"Spam complaint from {email}")
        # TODO: suppress the contact in your own database

    elif kind == "email.click":
        print(f"Link clicked by {email}: {event.get('link')}")

    elif kind == "email.open":
        print(f"Email opened by {email}")

    elif kind == "email.delivery":
        print(f"Email delivered to {email}")

    elif kind == "email.sent":
        print(f"Email sent to {email}")

    elif kind == "email.received":
        print(f"Inbound email from {event.get('from')}")

    elif kind == "segment":
        print(f"Segment event for {event.get('segmentName')}")

    else:
        # Contact events, custom events and custom bodies land here: plain JSON.
        name = workflow.get("name")
        print(f'Plunk webhook from workflow "{name}"' if name else "Plunk webhook")


@app.api_route(
    "/webhooks/plunk",
    methods=WEBHOOK_METHODS,
    dependencies=[Depends(require_plunk_secret)],
)
async def plunk_webhook(request: Request):
    # Read the raw body so any content type is accepted; GET/DELETE and custom bodies may be empty.
    raw_body = await request.body()

    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Plunk webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
