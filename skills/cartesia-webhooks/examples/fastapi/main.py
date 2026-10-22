# Generated with: cartesia-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Cartesia retries a failed delivery, so the same event can arrive more than once.
# webhook_request_id is stable across retries. Use a shared store (Redis, DB) in production.
processed: set[str] = set()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_cartesia_request(headers, secret=None) -> bool:
    """Cartesia does not sign the payload. It sends the secret you set on the
    webhook, raw with no prefix, in the x-webhook-secret header."""
    if secret is None:
        secret = os.environ.get("CARTESIA_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept requests when unconfigured
    received = headers.get("x-webhook-secret")
    if not received:
        return False
    return safe_equal(received, secret)


async def require_cartesia_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_cartesia_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-webhook-secret")


def handle_event(event: dict) -> None:
    event_type = event.get("type")
    call = event.get("call") or {}

    if event_type == "call_started":
        print(f"Call started: {event.get('call_id')} (agent {event.get('agent_id')})")
        # TODO: open a call record

    elif event_type == "call_completed":
        print(f"Call completed: {event.get('call_id')} ({call.get('end_reason')})")
        # TODO: store the transcript in call["transcript"]

    elif event_type == "call_failed":
        print(f"Call failed: {event.get('call_id')} ({call.get('error_message')})")
        # TODO: alert the owning team

    elif event_type == "call_turn":
        turn = event.get("turn") or {}
        print(f"Turn {turn.get('id')} ({turn.get('role')}): {turn.get('text')}")
        # TODO: stream the turn to a live dashboard

    elif event_type == "post_call_analysis":
        print(f"Call summary: {(event.get('analysis') or {}).get('summary')}")
        # TODO: attach the summary to the call record

    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/cartesia", dependencies=[Depends(require_cartesia_secret)])
async def cartesia_webhook(request: Request):
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    request_id = event.get("webhook_request_id")
    if request_id and request_id in processed:
        return {"received": True, "duplicate": True}

    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Cartesia event: {err}")
        # 5xx is retried by Cartesia (up to 3 attempts).
        raise HTTPException(status_code=500, detail="Handler error")

    if request_id:
        processed.add(request_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
