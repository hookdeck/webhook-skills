# Generated with: incode-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises TypeError
    on a non-ASCII str, but accepts any bytes."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_incode_request(headers, secret=None, header_name=None) -> bool:
    """Incode does not sign payloads. You add a custom header in Dashboard >
    Configuration > Webhooks and Incode sends it on every webhook. The header name is
    yours to choose, so it comes from INCODE_WEBHOOK_HEADER (default Authorization).
    The WHOLE header value is compared with INCODE_WEBHOOK_SECRET: no prefix is
    stripped or parsed (a "Bearer " you typed into the value is part of the value).
    """
    secret = secret if secret is not None else os.environ.get("INCODE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("INCODE_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_incode_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_incode_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook header")


def event_name(payload: dict):
    """Each webhook kind carries its name in a different field."""
    return payload.get("event_type") or payload.get("eventType") or payload.get("onboardingStatus")


def handle_event(payload: dict) -> None:
    event = event_name(payload)
    interview_id = payload.get("interviewId")

    # Session webhooks (event_type)
    if event == "SESSION_STARTED":
        print(f"Session started: {interview_id}")
        # TODO: mark the applicant as in progress

    elif event == "SESSION_PROGRESS":
        print(f"Session progress: {interview_id}")
        # TODO: track resumed sessions

    elif event == "SESSION_SUCCEEDED":
        print(f"Session succeeded: {interview_id} (identity {payload.get('identityId')})")
        # TODO: approve the applicant, fetch results with the Incode API

    elif event == "SESSION_FAILED":
        print(f"Session failed: {interview_id} ({', '.join(payload.get('failureReasons') or [])})")
        # TODO: reject or retry the applicant (payload["failureReasons"])

    elif event == "SESSION_PENDING_REVIEW":
        print(f"Session pending review: {interview_id}")
        # TODO: queue for manual review

    # Identity Enrolled (eventType)
    elif event == "IDENTITY_ENROLLED":
        print(f"Identity enrolled: {payload.get('identityId')}")
        # TODO: link payload["identityId"] to your user record

    # Onboarding status webhook (onboardingStatus)
    elif event in (
        "ID_VALIDATION_FINISHED",
        "ID_VALIDATION_FINISHED_SECOND_ID",
        "GOVERNMENT_VALIDATION_FINISHED",
        "FACE_VALIDATION_FINISHED",
        "POST_PROCESSING_FINISHED",
        "POST_PROCESSING_FINISHED_SECOND_ID",
    ):
        print(f"Onboarding step finished: {event} ({interview_id})")
        # TODO: optionally fetch partial results; wait for ONBOARDING_FINISHED for final data

    elif event == "ONBOARDING_FINISHED":
        print(f"Onboarding finished: {interview_id}")
        # TODO: fetch the final session results

    elif event == "MANUAL_REVIEW_APPROVED":
        print(f"Manual review approved: {interview_id}")
        # TODO: approve the applicant

    elif event == "MANUAL_REVIEW_REJECTED":
        print(f"Manual review rejected: {interview_id}")
        # TODO: reject the applicant

    elif event == "EXPIRED":
        print(f"Session expired: {interview_id}")
        # TODO: expire the pending applicant

    elif event == "DELETED":
        print(f"Sessions deleted: {', '.join(payload.get('interviewIds') or [])}")
        # TODO: delete your copies of these sessions (note interviewIds, not interviewId)

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/incode", dependencies=[Depends(require_incode_header)])
async def incode_webhook(request: Request):
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
        print(f"Error handling Incode event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Incode retries unless it gets 200 with a JSON content type, or 204.
    return JSONResponse({"success": True})


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
