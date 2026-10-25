# Generated with: swoogo-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from typing import Optional
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_swoogo_request(headers, name=None, secret=None) -> bool:
    """Swoogo does not sign payloads. The user adds a secret header to the webhook
    (headers: [{key, value}]). The name is user-chosen, so it comes from
    SWOOGO_WEBHOOK_HEADER; the expected value is the exact, whole header value
    (including any "Bearer " prefix), so it is compared as-is, never parsed.
    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    name = name or os.environ.get("SWOOGO_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("SWOOGO_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    # Case-insensitive lookup (works for Starlette headers and plain dicts).
    received = next((v for k, v in headers.items() if k.lower() == name.lower()), None)
    if not received:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_swoogo_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_swoogo_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def parse_body(raw: bytes, content_type: str = ""):
    """Webhooks are json (application/json) or post (form-encoded): accept both."""
    try:
        text = raw.decode("utf-8")
        if "x-www-form-urlencoded" in content_type:
            return dict(parse_qsl(text, keep_blank_values=True))
        parsed = json.loads(text)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None
    return parsed if isinstance(parsed, dict) else None


# The body names neither the object nor the action, so this skill's convention is one
# Swoogo webhook per trigger_object, with ?object=<trigger_object> in the webhook URL.
# Payloads are illustrative: they carry whatever fields the webhook was configured to send.
def handle_change(obj, payload: dict) -> None:
    if obj == "event":
        print(f"Event changed: {payload.get('id')}")
        # TODO: sync event details

    elif obj == "contact":
        print(f"Contact changed: {payload.get('id')}")
        # TODO: sync the contact to your CRM

    elif obj == "registrant":
        print(f"Registrant changed: {payload.get('id')}")
        # TODO: upsert the registrant (insert and update both arrive here)

    elif obj == "speaker":
        print(f"Speaker changed: {payload.get('id')}")
        # TODO: sync the speaker roster

    elif obj == "sponsor":
        print(f"Sponsor changed: {payload.get('id')}")
        # TODO: sync the sponsor list

    elif obj == "session":
        print(f"Session changed: {payload.get('id')}")
        # TODO: refresh the agenda

    elif obj == "session_attendance":
        print(f"Session attendance changed: {payload.get('id')}")
        # TODO: record the check-in

    elif obj == "registrant_line_item":
        print(f"Registrant line item changed: {payload.get('id')}")
        # TODO: update fees and purchases

    else:
        print(f"Unhandled trigger object: {obj}")


@app.post("/webhooks/swoogo", dependencies=[Depends(require_swoogo_secret)])
async def swoogo_webhook(request: Request, object: Optional[str] = None):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    payload = parse_body(raw_body, request.headers.get("content-type", ""))
    if payload is None:
        raise HTTPException(status_code=400, detail="Expected a JSON object or form-encoded body")

    try:
        handle_change(object, payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Swoogo webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
