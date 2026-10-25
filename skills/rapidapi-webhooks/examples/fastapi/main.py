# Generated with: rapidapi-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode to bytes: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_rapidapi_request(headers, secret=None) -> bool:
    """RapidAPI Enterprise Hub does not sign payloads. Every event request carries the hub's
    webhook secret key as plain text in the x-rapidapi-webhook-secret header. Compare the
    WHOLE header value with the key you configured.
    """
    secret = secret if secret is not None else os.environ.get("RAPIDAPI_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("x-rapidapi-webhook-secret")
    return bool(received) and safe_equal(received, secret)


async def require_rapidapi_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_rapidapi_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-rapidapi-webhook-secret")


def get_event_name(payload: dict):
    """The body format isn't documented. Name the JSON field that holds the event type
    (for example after sending a "Test event" from the Admin Panel) in RAPIDAPI_EVENT_FIELD."""
    field = os.environ.get("RAPIDAPI_EVENT_FIELD")
    value = payload.get(field) if field else None
    return value if isinstance(value, str) else None


def handle_event(payload: dict) -> None:
    event = get_event_name(payload)

    if event == "API Created":
        print("API created")
        # TODO: sync the new API to your catalog or gateway

    elif event == "API Updated":
        print("API updated")
        # TODO: refresh the API in your gateway

    elif event == "API Deleted":
        print("API deleted")
        # TODO: remove the API from your gateway

    elif event == "Subscription Created":
        print("Subscription created")
        # TODO: sync the new subscription to your CRM or billing system

    elif event == "Subscription Updated":
        print("Subscription updated")
        # TODO: update the subscription downstream

    elif event == "User Created":
        print("User created")
        # TODO: provision the user in your systems

    elif event == "Billing Plan Updated":
        print("Billing plan updated")
        # TODO: update plan pricing downstream

    else:
        print(f"Unhandled event: {event or 'unknown (set RAPIDAPI_EVENT_FIELD)'}")


@app.post("/webhooks/rapidapi", dependencies=[Depends(require_rapidapi_secret)])
async def rapidapi_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling RapidAPI event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
