# Generated with: dynatrace-webhooks skill
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
    """Constant-time comparison: compare_digest on bytes (equal-length SHA-256 digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_dynatrace_request(headers, header_name=None, secret=None) -> bool:
    """Dynatrace does not sign payloads. Authenticate with a secret header added as an
    "Additional HTTP header" on the webhook integration. The header name is yours to
    choose (DYNATRACE_WEBHOOK_HEADER, default Authorization); the expected value is the
    exact, whole header value (DYNATRACE_WEBHOOK_SECRET). No "Bearer " parsing.
    """
    header_name = header_name or os.environ.get("DYNATRACE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("DYNATRACE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    # Lowercase both sides so plain dicts and Starlette headers behave the same.
    received = {k.lower(): v for k, v in headers.items()}.get(header_name.lower())
    return bool(received) and safe_equal(received, secret)


async def require_dynatrace_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_dynatrace_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_problem(payload: dict) -> None:
    # The body is a template you write, so the vendor adds no event field. This handler
    # assumes the illustrative JSON template from the skill and dispatches on State.
    state = payload.get("State")
    problem_id = payload.get("ProblemID")
    title = payload.get("ProblemTitle")

    if state == "OPEN":
        print(f"Problem opened: {problem_id} {title}")
        # TODO: page on-call or open a ticket (payload["ImpactedEntity"])

    else:
        # Dynatrace also notifies when a problem is resolved, but its docs show only the
        # OPEN value of {State}. Log other values and match on what a real delivery sends.
        print(f"Problem {problem_id} state {state}: {title}")
        # TODO: close the matching ticket once you have confirmed the resolved State value


@app.post("/webhooks/dynatrace", dependencies=[Depends(require_dynatrace_secret)])
async def dynatrace_webhook(request: Request):
    # Read the raw body so any content type (JSON, text, XML) is accepted.
    raw_body = await request.body()

    # The template may produce JSON, text or XML. Only JSON objects are dispatched.
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = None

    try:
        if isinstance(payload, dict):
            handle_problem(payload)
        else:
            print(f"Received non-JSON notification ({len(raw_body)} bytes)")
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Dynatrace notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
