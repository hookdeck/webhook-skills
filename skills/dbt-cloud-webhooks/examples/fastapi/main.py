# Generated with: dbt-cloud-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_dbt_cloud_signature(raw_body: bytes, auth_header: str | None, secret: str | None) -> bool:
    """Verify a dbt Cloud webhook.

    dbt Cloud puts the bare lowercase hex HMAC-SHA256 of the raw request body in
    the `Authorization` header (no scheme, no "Bearer"), keyed with the webhook's
    secret (`hmac_secret`) used as a raw UTF-8 string.
    """
    if not auth_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Timing-safe comparison (returns False on length mismatch)
    return hmac.compare_digest(auth_header.strip().encode(), expected.encode())


@app.post("/webhooks/dbt-cloud")
async def dbt_cloud_webhook(request: Request):
    # Read the raw body - never parse JSON before verifying
    raw_body = await request.body()
    auth_header = request.headers.get("authorization")

    if not auth_header:
        raise HTTPException(status_code=400, detail="Missing Authorization header")

    # Read the secret per request so it can be changed without re-importing
    if not verify_dbt_cloud_signature(raw_body, auth_header, os.getenv("DBT_CLOUD_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Signature is valid - safe to parse the event
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # eventId is unique per event: use it to dedupe retries
    # (job.run.errored is a subset of job.run.completed, so one failed run can notify twice)
    event_type = event.get("eventType")
    data = event.get("data") or {}

    if event_type == "job.run.started":
        print("Run started:", data.get("runId"), data.get("jobName"))
        # TODO: Post to chat, mark the pipeline as in progress, etc.
    elif event_type == "job.run.completed":
        print("Run completed:", data.get("runId"), data.get("runStatus"))
        # TODO: Fetch artifacts, trigger downstream jobs, refresh dashboards, etc.
    elif event_type == "job.run.errored":
        print("Run errored:", data.get("runId"), data.get("runStatusMessage"))
        # TODO: Page on-call, open a ticket, etc. (artifacts may not be ingested yet)
    else:
        print(f"Unhandled event type: {event_type}")

    # Return 2xx quickly: dbt times out after 10 seconds
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
