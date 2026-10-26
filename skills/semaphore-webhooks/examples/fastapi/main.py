# Generated with: semaphore-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI(title="Semaphore CI Webhook Handler")

# Semaphore's docs don't name the HTTP method, so accept all the usual ones.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

_HEX_64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_semaphore_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str]) -> bool:
    """
    Semaphore sends X-Semaphore-Signature-256: the lowercase hex HMAC-SHA256 of the
    raw body bytes (no prefix, no timestamp), keyed with the WEBHOOK_SECRET value.
    """
    if not secret or not signature or not _HEX_64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare_digest on bytes; hex is compared case-insensitively.
    return hmac.compare_digest(expected.encode("ascii"), signature.lower().encode("ascii"))


async def verified_body(
    request: Request,
    x_semaphore_signature_256: Optional[str] = Header(None),
) -> bytes:
    """FastAPI dependency: verifies the signature over the raw bytes, for every method."""
    secret = os.getenv("SEMAPHORE_WEBHOOK_SECRET")

    # Fail closed: without a configured secret there is nothing to check.
    if not secret:
        print("Set SEMAPHORE_WEBHOOK_SECRET")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    raw = await request.body()  # a missing body is zero bytes
    if not verify_semaphore_signature(raw, x_semaphore_signature_256, secret):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")
    return raw


def handle_semaphore_event(payload: Dict[str, Any], webhook_id: Optional[str]) -> None:
    # No event-name field: every delivery is a finished pipeline. Dispatch on pipeline.result.
    pipeline = _as_dict(payload.get("pipeline"))
    project = _as_dict(payload.get("project"))
    result = pipeline.get("result")
    label = f"{project.get('name')}/{pipeline.get('name')} ({pipeline.get('id')}) [{webhook_id or 'no id'}]"

    if result == "passed":
        print(f"Pipeline passed: {label}")
        # TODO: mark the commit green, trigger a deploy
    elif result == "failed":
        print(f"Pipeline failed: {label}")
        # TODO: alert the team, inspect payload["blocks"][*]["jobs"] for the failing job
    elif result == "stopped":
        print(f"Pipeline stopped: {label}")
        # TODO: record that it was stopped (pipeline.result_reason says why)
    elif result == "canceled":
        print(f"Pipeline canceled: {label}")
        # TODO: record that it was canceled
    else:
        print(f"Unhandled Semaphore pipeline result: {result}")


@app.api_route("/webhooks/semaphore", methods=ALLOWED_METHODS)
async def handle_semaphore_webhook(
    raw: bytes = Depends(verified_body),
    x_semaphore_webhook_id: Optional[str] = Header(None),
):
    # GET and DELETE carry no body: once verified, acknowledge them.
    if not raw:
        return {"received": True}

    try:
        payload = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        # X-Semaphore-Webhook-Id is the dedupe key (a timeout retry re-sends the same delivery).
        handle_semaphore_event(payload, x_semaphore_webhook_id)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Semaphore event: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
