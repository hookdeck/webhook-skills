# Generated with: jobadder-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_jobadder_request(headers, config=os.environ) -> bool:
    """JobAdder does not sign payloads. The only credential is the optional
    `authorization` value set on the webhook, which JobAdder sends back as the
    Authorization header. Compare the WHOLE header value (including any "Basic " /
    "Bearer " prefix) to JOBADDER_AUTHORIZATION. Never strip, parse or base64-decode it.
    """
    expected = config.get("JOBADDER_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_jobadder_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_jobadder_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    event_id = payload.get("eventId")

    if event == "candidate_status_changed":
        print(f"Candidate status changed (event {event_id})")
        # TODO: sync the candidate's new status to your system

    elif event == "job_status_changed":
        print(f"Job status changed (event {event_id})")
        # TODO: update the job in your system

    elif event == "jobapplication_status_changed":
        print(f"Job application status changed (event {event_id})")
        # TODO: move the application along your pipeline

    elif event == "placement_approved":
        print(f"Placement approved (event {event_id})")
        # TODO: trigger onboarding or invoicing

    else:
        print(f"Unhandled JobAdder event: {event}")


@app.post("/webhooks/jobadder", dependencies=[Depends(require_jobadder_auth)])
async def jobadder_webhook(request: Request):
    # Read the raw body so any content type works.
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
        print(f"Error handling JobAdder webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
