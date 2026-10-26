# Generated with: fountain-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


def _as_list(value):
    """A nested JSON array, or [] when the field is missing or another type."""
    return value if isinstance(value, list) else []


def _as_str(value):
    """A JSON string field, or "" when the field is missing or another type."""
    return value if isinstance(value, str) else ""


load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_fountain_signature(raw_body: bytes, signature_header, secret=None) -> bool:
    """Fountain signs the raw request body: X-OBIQ-SIGNATURE-V2 = hex(HMAC-SHA256(key = your
    Fountain Hire private API token, message = body)). No prefix, no timestamp.
    Accounts switched to applicant-ID signing are not supported.
    """
    secret = secret if secret is not None else os.environ.get("FOUNTAIN_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    # Validate length and alphabet before decoding.
    if not isinstance(signature_header, str) or not HEX_SHA256.fullmatch(signature_header):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    received = bytes.fromhex(signature_header)  # hex is case-insensitive
    return hmac.compare_digest(received, expected)  # bytes, never str


async def verified_body(request: Request) -> bytes:
    """FastAPI dependency: read the raw body and reject the request before parsing it."""
    raw_body = await request.body()
    if not verify_fountain_signature(raw_body, request.headers.get("x-obiq-signature-v2")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")
    return raw_body


def classify(payload: dict):
    """Fountain deliveries have no event-name field or header, so dispatch on the payload shape:
    screening events are {"applicant": {...}}, Post-Hire events are the flat worker object.
    """
    if isinstance(payload.get("applicant"), dict):
        return "applicant"
    if isinstance(payload.get("id"), str) and "is_active" in payload:
        return "worker"
    return None


def handle_event(kind, payload: dict) -> None:
    if kind == "applicant":
        applicant = payload["applicant"]
        stage = _as_dict(applicant.get("stage"))
        print(f"Applicant {applicant.get('id')} ({applicant.get('name')}) is in stage: {stage.get('title')}")
        for check in _as_list(applicant.get("background_checks")):
            print(f"  Background check {_as_str(check.get('id'))} status: {check.get('status')}")
        # TODO: sync the stage change or background-check result to your system

    elif kind == "worker":
        print(f"Worker {payload.get('id')} ({payload.get('name')}) is_active={str(payload.get('is_active')).lower()}")
        for check in _as_list(payload.get("data_collection_checks")):
            print(f"  Document check {check.get('id')}: {check.get('status')}")
        # TODO: activate/deactivate the worker, or fetch approved documents

    else:
        print("Unhandled Fountain payload shape")


@app.post("/webhooks/fountain")
async def fountain_webhook(raw_body: bytes = Depends(verified_body)):
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(classify(payload), payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Fountain webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
