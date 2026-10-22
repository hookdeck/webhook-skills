# Generated with: assemblyai-webhooks skill
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


def verify_assemblyai_request(headers, config=os.environ) -> bool:
    """AssemblyAI does not sign webhooks. It sends the custom header you
    registered with webhook_auth_header_name / webhook_auth_header_value,
    verbatim. Starlette headers are case-insensitive."""
    name = config.get("ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME")
    expected = config.get("ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE")
    if not name or not expected:
        return False  # never accept when unconfigured

    received = headers.get(name.lower())
    return received is not None and safe_equal(received, expected)


async def require_assemblyai_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed.
    A 4xx tells AssemblyAI the delivery failed and must not be retried."""
    if not verify_assemblyai_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook auth header")


def handle_event(payload: dict) -> None:
    """The payload only carries {transcript_id, status}. Fetch the transcript
    with GET /v2/transcript/{transcript_id} to get the text or the error."""
    transcript_id = payload.get("transcript_id")
    status = payload.get("status")

    if status == "completed":
        print(f"Transcript completed: {transcript_id}")
        # TODO: GET https://api.assemblyai.com/v2/transcript/{id} and use ["text"]

    elif status == "error":
        print(f"Transcript failed: {transcript_id}")
        # TODO: GET the transcript and read its "error" field

    else:
        print(f"Unhandled status: {status} (transcript: {transcript_id})")


@app.post("/webhooks/assemblyai", dependencies=[Depends(require_assemblyai_auth)])
async def assemblyai_webhook(request: Request):
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
        print(f"Error handling AssemblyAI event: {err}")
        # A 5xx (or no 2xx within 10s) makes AssemblyAI retry, up to 10 attempts.
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
