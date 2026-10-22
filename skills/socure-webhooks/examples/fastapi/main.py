# Generated with: socure-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

_BASIC_RE = re.compile(r"^basic\s+([A-Za-z0-9+/]+={0,2})\s*$", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on equal-length SHA-256 digests of bytes)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def parse_basic_auth(header):
    """Parse 'Authorization: Basic base64(username:password)'.

    The scheme is case-insensitive and credentials split on the FIRST colon. Returns
    (username, password) as bytes, or None for a missing or malformed header.
    """
    if not isinstance(header, str):
        return None
    match = _BASIC_RE.match(header)
    if not match:
        return None
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(b":")
    if not sep:
        return None
    return username, password


def verify_socure_request(headers, username=None, password=None) -> bool:
    """Socure RiskOS does not sign payloads. It sends the Basic credentials configured on
    the webhook with every request. Compare username and password each in constant time
    and evaluate both before deciding (no short-circuit).
    """
    username = username if username is not None else os.environ.get("SOCURE_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("SOCURE_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    user_ok = safe_equal(creds[0], username.encode("utf-8"))
    pass_ok = safe_equal(creds[1], password.encode("utf-8"))
    return user_ok and pass_ok


async def require_socure_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_socure_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def handle_event(payload: dict) -> None:
    event_id = payload.get("event_id")
    event_type = payload.get("event_type")
    data = payload.get("data")
    data = data if isinstance(data, dict) else {}

    if event_type == "evaluation_completed":
        print(f"Evaluation completed: {data.get('eval_id')} decision={data.get('decision')}")
        # TODO: act on data["decision"] (ACCEPT / REVIEW / REJECT)

    elif event_type == "evaluation_paused":
        print(f"Evaluation paused: {data.get('eval_id')}")
        # TODO: send the user to step-up (DocV, OTP) and resume the evaluation

    elif event_type == "reevaluation":
        print(f"Case reevaluated: {data.get('eval_id')}")
        # TODO: refresh the stored decision

    elif event_type == "workflow_execution_failed":
        print(f"Workflow execution failed: {data.get('eval_id')}")
        # TODO: alert and retry the evaluation

    elif event_type == "decision_update":
        print(f"Decision updated: {data.get('eval_id')}")
        # TODO: sync the reviewer's new decision

    elif event_type == "fraud_confirming":
        print(f"Fraud status confirmed: {data.get('eval_id')}")
        # TODO: record the fraud / non-fraud label

    elif event_type == "review_case_assigned":
        print(f"Case assigned: {data.get('id')}")
        # TODO: notify the reviewer

    elif event_type == "review_case_unassigned":
        print(f"Case unassigned: {data.get('id')}")
        # TODO: return the case to the queue

    elif event_type == "case_status_updated":
        print(f"Case status updated: {data.get('id')}")
        # TODO: sync the case status and sub-status

    elif event_type == "case_notes_added":
        print(f"Case notes added: {data.get('id')}")
        # TODO: sync the notes

    elif event_type == "case_attachment_added":
        print(f"Case attachment added: {data.get('id')}")
        # TODO: sync the attachments

    elif event_type == "watchlist_notification_monitored_search_updated":
        print(f"Watchlist monitoring updated: {data.get('id')}")
        # TODO: review the monitored entity

    elif event_type == "case_management_notification_case_closure":
        print(f"Watchlist case closed: {data.get('id')}")
        # TODO: close the matching case

    else:
        print(f"Unhandled event: {event_type} ({event_id})")


@app.post("/webhooks/socure", dependencies=[Depends(require_socure_auth)])
async def socure_webhook(request: Request):
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
        print(f"Error handling Socure event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
