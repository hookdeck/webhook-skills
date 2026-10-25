# Generated with: lessonly-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes: compare_digest on a
    str raises TypeError for non-ASCII input."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_lessonly_request(headers, config=os.environ) -> bool:
    """Lessonly (Seismic Learning) does not sign payloads. The credential is the
    Authorization header, sent verbatim from lesson_completed_callback_authorization.
    Compare the WHOLE header value, including any "Bearer " or "Basic " prefix you
    set; do not strip, parse or base64-decode it.

    A static credential authenticates the sender, not the body, and gives no replay
    protection: use HTTPS and rotate the credential if it leaks.
    """
    expected = config.get("LESSONLY_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_lessonly_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_lessonly_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_lesson_completed(payload: dict) -> None:
    """Lessonly sends one webhook, "lesson completed", with no event-type field.
    The payload is not documented; lesson_id, user_id and completed_at are
    ILLUSTRATIVE."""
    print(
        f"Lesson completed: lesson {payload.get('lesson_id')} "
        f"by user {payload.get('user_id')} at {payload.get('completed_at')}"
    )
    # TODO: record the completion (dedupe on user + lesson, there is no event ID)


@app.post("/webhooks/lessonly", dependencies=[Depends(require_lessonly_auth)])
async def lessonly_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_lesson_completed(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Lessonly webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
