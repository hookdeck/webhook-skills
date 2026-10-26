# Generated with: aimfox-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison: compare_digest on bytes (equal-length SHA-256 digests).
    Passing str would raise TypeError on non-ASCII input."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_aimfox_request(headers, secret=None) -> bool:
    """Aimfox does not sign payloads. The only authentication is the "Authentication Header"
    you add to the webhook: a user-chosen header name (AIMFOX_WEBHOOK_HEADER, default
    Authorization) whose whole value (AIMFOX_WEBHOOK_SECRET, including any "Bearer " or
    "Basic " prefix) is compared as-is. This authenticates the sender, not the body, and
    gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("AIMFOX_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    name = os.environ.get("AIMFOX_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name.lower())  # incoming header names are lowercased
    return bool(received) and safe_equal(received, secret)


async def require_aimfox_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_aimfox_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Aimfox authentication header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("event_type")
    event_id = payload.get("id")

    if event_type == "account_logged_in":
        print(f"Account logged in ({event_id})")
        # TODO: mark the account active (payload["event"]["account"])

    elif event_type == "account_logged_out":
        print(f"Account logged out ({event_id})")
        # TODO: alert someone to re-authenticate (payload["event"]["account"])

    elif event_type == "new_connection":
        print(f"New connection ({event_id})")
        # TODO: create a CRM contact

    elif event_type == "view":
        print(f"Profile viewed ({event_id})")

    elif event_type == "connect":
        print(f"Connection request sent ({event_id})")

    elif event_type == "accepted":
        print(f"Connection request accepted ({event_id})")
        # TODO: start a follow-up sequence

    elif event_type == "inmail":
        print(f"InMail sent ({event_id})")

    elif event_type == "message":
        print(f"Message sent ({event_id})")

    elif event_type == "new_reply":
        print(f"New reply ({event_id})")
        # TODO: notify sales

    elif event_type == "reply":
        print(f"First campaign reply ({event_id})")

    elif event_type == "inmail_reply":
        print(f"InMail reply ({event_id})")

    elif event_type == "lead_label_added":
        print(f"Lead label added ({event_id})")
        # TODO: sync the label to your CRM

    elif event_type == "campaign_created":
        print(f"Campaign created ({event_id})")

    elif event_type == "campaign_started":
        print(f"Campaign started ({event_id})")

    elif event_type == "campaign_ended":
        print(f"Campaign ended ({event_id})")

    elif event_type == "inbox_event":
        print(f"Inbox event ({event_id})")

    elif event_type == "campaign_reply":
        print(f"Campaign reply ({event_id})")

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/aimfox", dependencies=[Depends(require_aimfox_header)])
async def aimfox_webhook(request: Request):
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
        print(f"Error handling Aimfox event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
