# Generated with: jfrog-webhooks skill
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


def verify_jfrog_request(headers, secret=None) -> bool:
    """Token mode (the default, "use secret for signing" off): JFrog sends the
    configured secret token as-is in the X-JFrog-Event-Auth header. There is no
    payload signature, so compare the header to the secret.
    Signing mode (an HMAC-SHA256 of the payload) is not covered: JFrog does not
    document which header carries that signature.
    """
    if secret is None:
        secret = os.environ.get("JFROG_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    token = headers.get("x-jfrog-event-auth")
    return bool(token) and safe_equal(token, secret)


async def require_jfrog_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_jfrog_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing X-JFrog-Event-Auth")


def handle_event(payload: dict) -> None:
    """Every JFrog payload has a `domain` and an `event_type`. Dispatch on both."""
    domain = payload.get("domain")
    event_type = payload.get("event_type")
    data = payload.get("data") or {}
    event = f"{domain}.{event_type}"

    if event == "artifact.deployed":
        print(f"Artifact deployed: {data.get('repo_key')}/{data.get('path')}")
        # TODO: trigger a scan or notify the team

    elif event == "artifact.deleted":
        print(f"Artifact deleted: {data.get('repo_key')}/{data.get('path')}")
        # TODO: clean up downstream indexes

    elif event == "artifact.moved":
        print(f"Artifact moved: {data.get('source_repo_path')} -> {data.get('target_repo_path')}")
        # TODO: record the promotion

    elif event == "docker.pushed":
        print(f"Docker tag pushed: {data.get('image_name')}:{data.get('tag')}")
        # TODO: roll out the new image

    elif event == "build.uploaded":
        print(f"Build uploaded: {data.get('build_name')} #{data.get('build_number')}")
        # TODO: start the release pipeline

    elif event == "build.promoted":
        print(f"Build promoted: {data.get('build_name')} #{data.get('build_number')}")
        # TODO: deploy the promoted build

    else:
        print(f"Unhandled event: {domain} {event_type}")


@app.post("/webhooks/jfrog", dependencies=[Depends(require_jfrog_auth)])
async def jfrog_webhook(request: Request):
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
        print(f"Error handling JFrog event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
