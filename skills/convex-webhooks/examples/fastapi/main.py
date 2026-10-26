# Generated with: convex-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

PREFIX = "sha256="
HEX_DIGEST = re.compile(r"[0-9a-f]{64}")


def verify_signature(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Convex log stream: x-webhook-signature = "sha256=" + hex(HMAC-SHA256(secret, raw_body)).

    Only the raw body is signed (no timestamp), and the bare digest is accepted too.
    """
    if not signature_header or not secret:
        return False
    received = signature_header[len(PREFIX):] if signature_header.startswith(PREFIX) else signature_header
    received = received.lower()
    # Validate the shape first: exactly 64 lowercase hex characters
    if not HEX_DIGEST.fullmatch(received):
        return False
    computed = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received.encode("ascii"), computed.encode("ascii"))


def parse_events(raw_body: bytes) -> list:
    """The body is a JSON array of log events (or one JSON object per line for JSONL streams)."""
    try:
        parsed = json.loads(raw_body)
        return parsed if isinstance(parsed, list) else [parsed]
    except json.JSONDecodeError:
        return [json.loads(line) for line in raw_body.decode("utf-8").splitlines() if line.strip()]


@app.post("/webhooks/convex")
async def convex_webhook(request: Request):
    # Raw bytes are required for signature verification
    raw_body = await request.body()
    signature = request.headers.get("x-webhook-signature")

    if not signature:
        raise HTTPException(status_code=401, detail="Missing x-webhook-signature header")
    if not verify_signature(raw_body, signature, os.getenv("CONVEX_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        events = parse_events(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # There is no event header: each event in the batch carries its own `topic`
    for event in events:
        if not isinstance(event, dict):
            continue
        topic = event.get("topic")
        function = event.get("function") or {}
        if topic == "verification":
            print("Log stream verified:", event.get("message"))
        elif topic == "console":
            print(f"[{event.get('log_level')}] {function.get('path')}: {event.get('message')}")
        elif topic == "function_execution":
            print(
                f"{function.get('type')} {function.get('path')} {event.get('status')} "
                f"in {event.get('execution_time_ms')}ms"
            )
        elif topic == "audit_log":
            print("Audit log:", event.get("audit_log_action"))
        elif topic == "scheduler_stats":
            print(f"Scheduler lag {event.get('lag_seconds')}s, {event.get('num_running_jobs')} running jobs")
        elif topic == "current_storage_usage":
            print("Storage usage: documents", event.get("total_document_size_bytes"), "bytes")
        else:
            print("Unhandled topic:", topic)

    return {"received": True}
