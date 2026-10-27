# Generated with: bamboohr-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
import time
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")


def verify_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    private_key: Optional[str],
) -> bool:
    """X-BambooHR-Signature is the hex HMAC-SHA256 of the raw body followed directly by
    the X-BambooHR-Timestamp header value (no separator), keyed with the webhook's private key."""
    if not signature or not timestamp or not private_key:
        return False
    if not HEX_SHA256.fullmatch(signature):
        return False
    message = b"".join([raw_body, timestamp.encode("latin-1")])
    expected = hmac.new(private_key.encode(), message, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(signature), expected)


def within_tolerance(timestamp: str, tolerance_seconds: float) -> bool:
    """Opt-in replay window. Off by default: retries and replays resend the original timestamp.
    BambooHR doesn't document the header format, so it is only parsed when enabled
    (epoch seconds or milliseconds)."""
    if tolerance_seconds <= 0:
        return True
    if not timestamp.isascii() or not timestamp.isdigit():
        return False
    sent = float(timestamp)
    if sent > 1e11:
        sent /= 1000  # milliseconds
    return abs(time.time() - sent) <= tolerance_seconds


@app.post("/webhooks/bamboohr")
async def bamboohr_webhook(
    request: Request,
    x_bamboohr_signature: Optional[str] = Header(None),
    x_bamboohr_timestamp: Optional[str] = Header(None),
):
    # Raw body is required for signature verification (works for JSON and form payloads)
    raw_body = await request.body()

    if not verify_signature(
        raw_body,
        x_bamboohr_signature,
        x_bamboohr_timestamp,
        os.getenv("BAMBOOHR_WEBHOOK_SECRET"),
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    tolerance = float(os.getenv("BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS") or 0)
    if not within_tolerance(x_bamboohr_timestamp, tolerance):
        raise HTTPException(status_code=401, detail="Timestamp outside tolerance")

    # Parse only after verification
    if "application/x-www-form-urlencoded" in request.headers.get("content-type", ""):
        # Form payloads use keys like employees[40351][action]; JSON is recommended, so just acknowledge
        print("BambooHR: form-encoded payload received (configure the webhook for JSON to process it)")
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Event-based webhooks (recommended by BambooHR): one event per POST, {type, timestamp, data}
    if isinstance(payload.get("type"), str):
        event_type = payload["type"]
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        if event_type == "employee.created":
            print(f"BambooHR: employee {data.get('employeeId')} created")
        elif event_type == "employee.updated":
            print(f"BambooHR: employee {data.get('employeeId')} updated: {data.get('changedFields')}")
        elif event_type == "employee.deleted":
            print(f"BambooHR: employee {data.get('employeeId')} deleted")
        elif event_type in ("company.updated", "company.deleted", "company-integrations.updated"):
            print(f"BambooHR: {event_type} for company {data.get('companyId')}")
        else:
            print(f"BambooHR: unhandled event type {event_type}")
        return {"received": True}

    # Field-based (legacy) webhooks: employees may be batched into one POST; ignore unrecognized fields
    employees = payload.get("employees")
    for employee in employees if isinstance(employees, list) else []:
        if not isinstance(employee, dict):
            continue
        action = employee.get("action")
        employee_id = employee.get("id")
        if action == "Created":
            print(f"BambooHR: employee {employee_id} created")
        elif action == "Updated":
            print(f"BambooHR: employee {employee_id} updated: {employee.get('changedFields')}")
        elif action == "Deleted":
            print(f"BambooHR: employee {employee_id} deleted")
        else:
            print(f"BambooHR: unhandled action {action} for employee {employee_id}")

    return {"received": True}
