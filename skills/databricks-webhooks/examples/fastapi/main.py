# Generated with: databricks-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Body, Depends, FastAPI, Header, HTTPException

load_dotenv()

app = FastAPI(title="Databricks Webhook Handler")


def verify_databricks_auth(
    authorization: Optional[str],
    username: Optional[str],
    password: Optional[str],
) -> bool:
    """
    Authenticate a Databricks webhook request.

    Databricks does NOT sign webhook payloads (no HMAC/signature header). The
    Webhook notification destination can be given a username and password,
    which Databricks sends as `Authorization: Basic base64(username:password)`.
    """
    if not (authorization and username and password and authorization.startswith("Basic ")):
        return False

    try:
        decoded = base64.b64decode(authorization[6:], validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return False
    if ":" not in decoded:
        return False

    # Split on the FIRST colon; passwords may contain ':'
    user, _, pw = decoded.partition(":")
    # Evaluate both comparisons so timing doesn't reveal which one failed
    user_ok = hmac.compare_digest(user.encode(), username.encode())
    pass_ok = hmac.compare_digest(pw.encode(), password.encode())
    return user_ok and pass_ok


def require_databricks_auth(authorization: Optional[str] = Header(None)) -> None:
    """FastAPI dependency that authenticates the Databricks webhook request."""
    username = os.getenv("DATABRICKS_WEBHOOK_USERNAME")
    password = os.getenv("DATABRICKS_WEBHOOK_PASSWORD")

    # Fail closed: without configured credentials there is nothing to check.
    if not username or not password:
        print("Set DATABRICKS_WEBHOOK_USERNAME and DATABRICKS_WEBHOOK_PASSWORD")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    if not verify_databricks_auth(authorization, username, password):
        print("Databricks webhook authentication failed")
        raise HTTPException(status_code=401, detail="Unauthorized")


def handle_databricks_event(payload: Dict[str, Any]) -> None:
    # Job and task notifications use `event_type`; SQL alerts use `event`.
    if payload.get("event") == "alert_state_change":
        alert = payload.get("alert") or {}
        name = (alert.get("alert") or {}).get("name") or alert.get("title")
        print(f"SQL alert state change: {name}")
        # TODO: Route the alert (see alert.alert.evaluations[].state)
        return

    event_type = payload.get("event_type")
    run_id = (payload.get("run") or {}).get("run_id")
    job_name = (payload.get("job") or {}).get("name")
    task_key = (payload.get("task") or {}).get("task_key")
    where = f"task {task_key} of job {job_name}" if task_key else f"job {job_name}"

    if event_type == "jobs.on_start":
        print(f"Run {run_id} started: {where}")
        # TODO: Mark the pipeline as running
    elif event_type == "jobs.on_success":
        print(f"Run {run_id} succeeded: {where}")
        # TODO: Trigger downstream work
    elif event_type == "jobs.on_failure":
        print(f"Run {run_id} failed: {where}")
        # TODO: Alert on-call / open a ticket
    elif event_type == "jobs.on_duration_warning_threshold_exceeded":
        print(f"Run {run_id} exceeded its duration threshold: {where}")
        # TODO: Warn about slow runs
    else:
        print(f"Unhandled Databricks event: {event_type or payload.get('event') or 'unknown'}")


@app.post("/webhooks/databricks", dependencies=[Depends(require_databricks_auth)])
async def databricks_webhook(payload: Dict[str, Any] = Body(...)):
    # No body signature to protect, so ordinary JSON parsing is fine here.
    handle_databricks_event(payload)

    # Respond 2xx quickly
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
