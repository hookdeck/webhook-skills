# Generated with: connecteam-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Connecteam's docs don't name the method (the Chat guide says POST), so accept all of these.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison. Encode both sides to bytes (compare_digest
    raises on non-ASCII str) and compare equal-length digests."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_connecteam_request(headers, secret=None) -> bool:
    """Connecteam does not sign or hash the body. When a secretKey is set on the webhook,
    it is sent as-is in the x-webhook-secret header. Compare the WHOLE header value.
    This authenticates the sender only: it says nothing about the body and gives no
    replay protection.
    """
    secret = secret if secret is not None else os.environ.get("CONNECTEAM_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get("x-webhook-secret")  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_connecteam_secret(request: Request) -> None:
    """FastAPI dependency: reject the request, for every method, before the body is read."""
    if not verify_connecteam_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-webhook-secret")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")

    # Users
    if event_type in (
        "user_created", "user_updated", "user_deleted", "user_archived",
        "user_restored", "user_promoted", "user_demoted",
    ):
        print(f"User event {event_type}: {json.dumps(payload.get('data'))}")
        # TODO: sync payload["data"] (userId, email, isArchived) to your directory

    # Forms
    elif event_type in ("form_submission", "form_submission_edited", "manager_field_updated"):
        data = payload.get("data")
        submission_id = data.get("formSubmissionId") if isinstance(data, dict) else None
        print(f"Form event {event_type}: submission {submission_id}")
        # TODO: process payload["data"]["answers"]

    # Time clock (flat payload: userId, timeClockId at the root)
    elif event_type in (
        "clock_in", "clock_out", "auto_clock_out", "admin_add", "admin_edit", "admin_delete",
        "user_timesheet_submitted", "user_timesheet_unsubmitted",
        "user_timesheet_approved", "user_timesheet_reopened",
    ):
        print(
            f"Time activity event {event_type}: user {payload.get('userId')}, "
            f"clock {payload.get('timeClockId')}"
        )
        # TODO: update payroll or attendance records

    # Shift scheduler
    elif event_type in (
        "shift_created", "shift_updated", "shift_deleted",
        "availability_status_created", "availability_status_deleted",
    ):
        print(f"Scheduler event {event_type}: scheduler {payload.get('schedulerId')}")
        # TODO: sync payload["data"] to your calendar

    # Tasks
    elif event_type in ("task_published", "task_completed"):
        print(f"Task event {event_type}")
        # TODO: update your task tracker from payload["data"]

    # Chat
    elif event_type in (
        "message_created", "message_updated", "message_deleted",
        "conversation_created", "conversation_updated", "conversation_deleted",
    ):
        print(f"Chat event {event_type}")
        # TODO: mirror payload["data"]

    else:
        print(f"Unhandled event: {event_type}")


@app.api_route("/webhooks/connecteam", methods=METHODS, dependencies=[Depends(require_connecteam_secret)])
async def connecteam_webhook(request: Request):
    # Read the raw body so any content type is accepted; some methods may send none.
    raw_body = await request.body()
    if not raw_body.strip():
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
        print(f"Error handling Connecteam event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
