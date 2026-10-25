# Generated with: axiom-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_axiom_request(headers, name=None, secret=None) -> bool:
    """Axiom does not sign requests. You add a secret header to the Custom webhook
    notifier; the name is user-chosen (AXIOM_WEBHOOK_HEADER, default Authorization)
    and the expected value is the exact, whole header value (AXIOM_WEBHOOK_SECRET),
    including any "Bearer " prefix. Nothing is stripped or parsed.
    """
    name = name or os.environ.get("AXIOM_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("AXIOM_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_axiom_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_axiom_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    # The body is a Go template the notifier's author writes. This handler assumes the
    # default template: state in `action` (Open / Closed), monitor data under `event`.
    action = payload.get("action")
    event = payload.get("event")
    if not isinstance(event, dict):
        event = {}

    if action == "Open":
        print(f"Monitor opened: {event.get('title')} ({event.get('monitorID')})")
        # TODO: page on-call or open an incident (event["body"], event["value"], event["matchedEvent"])

    elif action == "Closed":
        print(f"Monitor closed: {event.get('title')} ({event.get('monitorID')})")
        # TODO: resolve the matching incident

    else:
        print(f"Unhandled action: {action}")


@app.post("/webhooks/axiom", dependencies=[Depends(require_axiom_secret)])
async def axiom_webhook(request: Request):
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
        print(f"Error handling Axiom notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
