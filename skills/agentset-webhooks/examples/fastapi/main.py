# Generated with: agentset-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Agentset's docs don't name the HTTP method, so accept all five.
METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]

HEX64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_agentset_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str] = None
) -> bool:
    """Agentset sends `agentset-signature`: the bare hex HMAC-SHA256 of the raw body, keyed with
    the webhook's signing secret (UTF-8 bytes, as-is). Nothing else is signed, so there is no
    timestamp or replay window to check. The format is validated before decoding.
    """
    secret = secret if secret is not None else os.environ.get("AGENTSET_WEBHOOK_SECRET")
    if not secret or not signature or not HEX64.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)  # bytes, never str


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: return the raw body (empty bytes if none) once it is verified."""
    raw_body = await request.body()
    if not verify_agentset_signature(raw_body, request.headers.get("agentset-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")
    return raw_body


def as_str(value) -> Optional[str]:
    return value if isinstance(value, str) else None


# Every parsed field is untrusted: check its type before reading into it.
def handle_event(payload: dict) -> None:
    event = as_str(payload.get("event"))
    data = payload.get("data")
    data = data if isinstance(data, dict) else {}
    item_id = as_str(data.get("id"))
    name = as_str(data.get("name"))

    if event == "document.ready":
        print(f"Document ready: {item_id} ({name})")
        # TODO: mark the document as searchable

    elif event == "document.error":
        print(f"Document failed: {item_id} ({name}): {as_str(data.get('error'))}")
        # TODO: alert and surface the error

    elif event == "document.deleted":
        print(f"Document deleted: {item_id}")
        # TODO: remove local records

    elif event == "ingest_job.ready":
        print(f"Ingest job ready: {item_id} ({name})")
        # TODO: mark the import as complete

    elif event == "ingest_job.error":
        print(f"Ingest job failed: {item_id} ({name}): {as_str(data.get('error'))}")
        # TODO: alert and retry

    else:
        print(f"Unhandled event: {event}")


@app.api_route("/webhooks/agentset", methods=METHODS)
async def agentset_webhook(request: Request, raw_body: bytes = Depends(verified_body)):
    if not raw_body.strip():
        print(f"{request.method} webhook with empty body")
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
        print(f"Error handling Agentset webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
