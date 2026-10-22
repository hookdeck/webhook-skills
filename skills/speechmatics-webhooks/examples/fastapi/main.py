# Generated with: speechmatics-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises
    TypeError on a non-ASCII str, but accepts any bytes."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_speechmatics_request(headers, config=os.environ) -> bool:
    """Speechmatics does not sign notifications. It sends the header you listed
    in notification_config[].auth_headers, verbatim. The whole value is compared:
    a "Bearer " prefix is part of the value, not parsed off. Starlette headers
    are case-insensitive. A static credential authenticates the sender only: no
    body signature, no replay protection."""
    name = config.get("SPEECHMATICS_WEBHOOK_HEADER") or "Authorization"
    expected = config.get("SPEECHMATICS_WEBHOOK_SECRET")
    if not expected:
        return False  # never accept when unconfigured

    received = headers.get(name.lower())
    return received is not None and safe_equal(received, expected)


async def require_speechmatics_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_speechmatics_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook auth header")


def describe_body(content_type: str, body: bytes) -> str:
    return f"{content_type or 'unknown type'}, {len(body)} bytes" if body else "no body"


def handle_event(job_id, status, content_type: str, body: bytes) -> None:
    """Speechmatics appends ?id=<job id>&status=<status> to your URL. The body is
    whatever `contents` you requested (JSON, text, multipart) and may be empty,
    so dispatch on the query."""
    if status == "success":
        print(f"Job succeeded: {job_id} ({describe_body(content_type, body)})")
        # TODO: store the transcript from `body`, or fetch it from the API by job id

    elif status == "error":
        print(f"Job failed: {job_id} ({describe_body(content_type, body)})")
        # TODO: only jobinfo is sent on error; read the job's errors from the API

    elif status == "fetch_error":
        print(f"Could not fetch the data file for job: {job_id}")

    elif status == "trim_error":
        print(f"Could not process the audio file for job: {job_id}")

    else:
        print(f"Unhandled status: {status} (job: {job_id})")


# The notification method is user-chosen: POST (default) or PUT.
@app.api_route(
    "/webhooks/speechmatics",
    methods=["POST", "PUT"],
    dependencies=[Depends(require_speechmatics_auth)],
)
async def speechmatics_webhook(request: Request):
    # Read the body raw, whatever the content type; it may be empty.
    body = await request.body()
    content_type = request.headers.get("content-type", "").lower()

    # Parse only after authentication, and only JSON content types.
    if body and "json" in content_type:
        try:
            json.loads(body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")

    try:
        handle_event(
            request.query_params.get("id"),
            request.query_params.get("status"),
            content_type,
            body,
        )
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Speechmatics notification: {err}")
        # A non-2xx makes Speechmatics retry until its timeout.
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
