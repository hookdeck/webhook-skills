# Generated with: fillout-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("fillout")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Use a database or cache in production; a set is enough to show the idea.
processed: set[str] = set()


def verify_fillout_auth(authorization: Optional[str], token: Optional[str]) -> bool:
    """Fillout does NOT sign webhooks: there is no signature header and no HMAC.

    Authentication is the custom header you add in Fillout under
    Integrate > Webhook > Advanced > Headers:  Authorization: Bearer <token>
    Compare the WHOLE header value against f"Bearer {FILLOUT_WEBHOOK_TOKEN}".
    """
    if not token or authorization is None:
        return False  # fail closed when the token is not configured
    # compare_digest is constant-time and returns False for different lengths
    return hmac.compare_digest(
        authorization.encode("utf-8"), f"Bearer {token}".encode("utf-8")
    )


def parse_fillout_payload(body: dict[str, Any]) -> dict[str, Any]:
    """Fillout has no event types; every delivery is a form submission.

    The body is either the full submission (Simple mode / API-created webhooks:
    submissionId, submissionTime, questions[], calculations[], urlParameters[], ...)
    or, in Advanced mode, a flat object of the keys you mapped in the Body section.
    """
    submission = body.get("submission")
    if not isinstance(submission, dict):
        submission = body
    if isinstance(submission.get("questions"), list):
        return {"kind": "submission", "submission": submission}
    return {"kind": "mapped", "fields": body}


def answers_by_id(questions: list[dict[str, Any]]) -> dict[str, Any]:
    """Look answers up by question id; `name` is the question text and can change."""
    return {q["id"]: q.get("value") for q in questions}


def dedupe_key(payload: dict[str, Any]) -> Optional[str]:
    """Retry integration, resubmits and edits all resend the same submissionId."""
    if payload["kind"] == "submission":
        submission = payload["submission"]
        submission_id = submission.get("submissionId")
        if not submission_id:
            return None
        return f"{submission_id}:{submission.get('lastUpdatedAt') or ''}"
    submission_id = payload["fields"].get("submissionId")
    return str(submission_id) if submission_id else None


def handle_submission(submission: dict[str, Any]) -> None:
    logger.info(
        "Form submission %s at %s: %s",
        submission.get("submissionId"),
        submission.get("submissionTime"),
        answers_by_id(submission["questions"]),
    )
    for booking in submission.get("scheduling") or []:
        value = booking.get("value") or {}
        logger.info(
            "Booking by %s starting %s", value.get("fullName"), value.get("eventStartTime")
        )
    quiz = submission.get("quiz")
    if quiz:
        logger.info("Quiz score %s/%s", quiz.get("score"), quiz.get("maxScore"))
    # TODO: save the submission, notify your team, etc.


@app.post("/webhooks/fillout")
async def fillout_webhook(
    request: Request, authorization: Optional[str] = Header(default=None)
):
    token = os.environ.get("FILLOUT_WEBHOOK_TOKEN")
    if not token:
        logger.error("FILLOUT_WEBHOOK_TOKEN is not set; rejecting webhook")
        return JSONResponse({"error": "Webhook token not configured"}, status_code=500)

    # Authenticate before reading the body
    if not verify_fillout_auth(authorization, token):
        return JSONResponse(
            {"error": "Invalid or missing Authorization header"}, status_code=401
        )

    try:
        body = json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)
    if not isinstance(body, dict):
        return JSONResponse({"error": "Expected a JSON object"}, status_code=400)

    payload = parse_fillout_payload(body)
    key = dedupe_key(payload)
    if key and key in processed:
        return {"received": True, "duplicate": True}

    try:
        if payload["kind"] == "submission":
            handle_submission(payload["submission"])
        else:
            logger.info("Form submission (Advanced mode mapped body): %s", payload["fields"])
            # TODO: read the keys you mapped in Fillout's Body section
    except Exception:
        logger.exception("Error handling Fillout submission")
        return JSONResponse({"error": "Processing failed"}, status_code=500)

    if key:
        processed.add(key)
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
