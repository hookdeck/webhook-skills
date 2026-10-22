# Generated with: make-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The HTTP module's method is user-chosen, so accept all the usual ones.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises
    TypeError on a non-ASCII str, but accepts bytes."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_make_request(headers, config=os.environ) -> bool:
    """Make's HTTP module does not sign requests. With an API key keychain
    (placement "In the header") it sends <parameter name>: <Key>, exactly as
    entered. Compare the WHOLE header value: don't strip a "Bearer " prefix, it
    is part of the Key.

    A static credential authenticates the sender, not the body, and gives no
    replay protection (no signature, no timestamp).
    """
    expected = config.get("MAKE_WEBHOOK_SECRET")
    if not expected:
        return False  # never accept when unconfigured

    header_name = config.get("MAKE_WEBHOOK_HEADER") or "Authorization"
    # Header names are case-insensitive, whatever mapping type was passed in.
    wanted = header_name.lower()
    received = next((v for k, v in headers.items() if k.lower() == wanted), None)
    return received is not None and safe_equal(received, expected)


async def require_make_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_make_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def handle_event(payload: dict) -> None:
    """Make has no built-in event types: the payload is whatever your scenario
    maps. These examples assume {"event": "...", "id": "...", "data": {...}}."""
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "order.created":
        print(f"Order created: {data.get('order_id')}")
        # TODO: fulfil the order

    elif event == "lead.created":
        print(f"Lead created: {data.get('email')}")
        # TODO: add the lead to your CRM

    elif event == "scenario.completed":
        print(f"Scenario completed: {data.get('scenario_name')}")
        # TODO: mark the job as done

    elif event == "scenario.failed":
        print(f"Scenario failed: {data.get('scenario_name')} ({data.get('error')})")
        # TODO: alert the owning team

    else:
        print(f"Unhandled event: {event} (id: {payload.get('id')})")


@app.api_route("/webhooks/make", methods=METHODS, dependencies=[Depends(require_make_auth)])
async def make_webhook(request: Request):
    # Raw body, any content type. GET requests arrive with no body.
    raw_body = await request.body()

    # An empty body (e.g. GET) is valid: there is simply no event to dispatch.
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Make event: {err}")
        # A non-2xx makes the HTTP module error, which stops the scenario run
        # unless an error handler route is attached.
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
