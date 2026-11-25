# Generated with: taskade-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import re
import hmac
import hashlib
import json
import time
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

SIGNATURE_RE = re.compile(r"[0-9a-fA-F]{64}")
TIMESTAMP_RE = re.compile(r"[0-9]+")

# Taskade's docs reject a delivery whose timestamp is more than 5 minutes from your clock
TOLERANCE_SECONDS = 5 * 60


def verify_taskade_webhook(
    raw_body: bytes,
    signature_header: Optional[str],
    timestamp_header: Optional[str],
    secret: Optional[str],
    now: Optional[float] = None,
) -> bool:
    """Verify X-Taskade-Signature-V2: sha256=<hex> of "<X-Taskade-Timestamp>.<raw body>"."""
    if not signature_header or not timestamp_header or not secret:
        return False
    if not TIMESTAMP_RE.fullmatch(timestamp_header):
        return False

    # Accept the value with or without the "sha256=" prefix
    sig = re.sub(r"^sha256=", "", signature_header.strip(), flags=re.IGNORECASE)

    # Validate the format before decoding
    if not SIGNATURE_RE.fullmatch(sig):
        return False

    signed = timestamp_header.encode("ascii") + b"." + raw_body
    expected = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).digest()

    # Timing-safe comparison on bytes
    if not hmac.compare_digest(bytes.fromhex(sig), expected):
        return False

    current = time.time() if now is None else now
    return abs(current - int(timestamp_header)) <= TOLERANCE_SECONDS


# No field or header names the event. In Taskade's Delivery payload table, each event
# has a top-level field the other five don't. Or register one URL per event.
EVENT_MARKERS = [
    ("task.assigned", "assignedNodes"),
    ("comment.created", "commentBody"),
    ("project.created", "creatorName"),
    ("project.assigned", "assigneeId"),
    ("project.joined", "joinerUserId"),
    ("task.due", "taskEndDate"),
]


def taskade_event_type(payload) -> Optional[str]:
    """Work out which Taskade event a delivery is from its fields."""
    if not isinstance(payload, dict):
        return None
    return next((event for event, field in EVENT_MARKERS if field in payload), None)


@app.post("/webhooks/taskade")
async def taskade_webhook(request: Request):
    # Raw bytes: the signature covers exactly what Taskade sent
    raw_body = await request.body()
    signature_header = request.headers.get("x-taskade-signature-v2")
    timestamp_header = request.headers.get("x-taskade-timestamp")

    # Read the secret per request so it can be configured after import
    if not verify_taskade_webhook(
        raw_body, signature_header, timestamp_header, os.environ.get("TASKADE_WEBHOOK_SECRET")
    ):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # A copy of a delivery can arrive inside the 5-minute window and still pass.
    # Make these handlers idempotent, or record each delivery you process and skip a repeat.
    event = taskade_event_type(payload)

    if event == "task.due":
        print(f"Task due: {payload.get('id')} {payload.get('projectId')}")
        # Your code: send a reminder or escalate

    elif event == "task.assigned":
        print(f"Task assigned in project: {payload.get('projectId')}")
        # Your code: notify each assignee in payload["assignedNodes"]

    elif event == "comment.created":
        print(f"Comment on task: {payload.get('nodeId')}")
        # Your code: mirror the comment

    elif event == "project.created":
        print(f"Project created: {payload.get('projectId')}")

    elif event == "project.assigned":
        print(f"Project assigned: {payload.get('projectId')}")

    elif event == "project.joined":
        print(f"Project joined: {payload.get('projectId')}")

    else:
        print("Unrecognised Taskade delivery")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
