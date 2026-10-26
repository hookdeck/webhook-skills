# Generated with: rev-ai-webhooks skill
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
    """Constant-time string comparison (compare_digest on equal-length digests of bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_rev_ai_request(headers, config=os.environ) -> bool:
    """Rev AI does not sign payloads. The credential is the Authorization header set in
    notification_config.auth_headers when the job is submitted, e.g. "Bearer <token>".
    Compare the WHOLE header value (scheme prefix included) with REV_AI_AUTHORIZATION.
    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    expected = config.get("REV_AI_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_rev_ai_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_rev_ai_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    job = payload.get("job")
    if not isinstance(job, dict):
        print("Unhandled Rev AI payload (no job object)")
        return

    status = job.get("status")
    if status == "transcribed":
        print(f"Job {job.get('id')} transcribed ({job.get('duration_seconds')}s)")
        # TODO: fetch the transcript with GET /speechtotext/v1/jobs/{id}/transcript

    elif status == "failed":
        print(f"Job {job.get('id')} failed: {job.get('failure')} - {job.get('failure_detail')}")
        # TODO: alert, or resubmit once the cause (e.g. download_failure) is fixed

    else:
        print(f"Unhandled Rev AI job status: {status}")


@app.post("/webhooks/rev-ai", dependencies=[Depends(require_rev_ai_auth)])
async def rev_ai_webhook(request: Request):
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
        print(f"Error handling Rev AI webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Rev AI retries every 30 minutes for 24 hours until it receives a 200.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
