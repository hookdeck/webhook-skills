import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_expo_signature(
    raw_body: bytes, signature_header: Optional[str], secret: Optional[str]
) -> bool:
    """Verify an Expo EAS webhook signature.

    EAS sends expo-signature = "sha1=" + hex(HMAC-SHA1(secret, raw_body)).
    """
    if not signature_header or not secret:
        return False

    expected = "sha1=" + hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(signature_header.encode("utf-8"), expected.encode("utf-8"))


def classify_payload(payload: dict) -> str:
    """EAS payloads have no event-type field: BUILD vs SUBMIT is set on the webhook
    itself, so tell them apart by their fields."""
    if (
        payload.get("submissionDetailsPageUrl")
        or payload.get("submissionInfo")
        or payload.get("archiveUrl")
    ):
        return "SUBMIT"
    if payload.get("buildDetailsPageUrl") or payload.get("artifacts") or payload.get("metadata"):
        return "BUILD"
    return "UNKNOWN"


def handle_build(build: dict) -> None:
    status = build.get("status")
    label = f"Build {build.get('id')} ({build.get('platform')})"

    if status == "finished":
        print(f"{label} finished: {(build.get('artifacts') or {}).get('buildUrl')}")
        # TODO: Download the artifact, notify the team, start QA

    elif status == "errored":
        print(f"{label} errored: {(build.get('error') or {}).get('message')}")
        # TODO: Alert the on-call channel

    elif status == "canceled":
        print(f"{label} canceled")

    else:
        print(f"Unhandled build status: {status}")


def handle_submit(submission: dict) -> None:
    status = submission.get("status")
    label = f"Submission {submission.get('id')} ({submission.get('platform')})"

    if status == "finished":
        print(f"{label} finished")
        # TODO: Announce the release

    elif status == "errored":
        error = (submission.get("submissionInfo") or {}).get("error") or {}
        print(f"{label} errored: {error.get('message')}")
        # TODO: Alert the release owner

    elif status == "canceled":
        print(f"{label} canceled")

    else:
        print(f"Unhandled submission status: {status}")


@app.post("/webhooks/expo")
async def expo_webhook(request: Request):
    secret = os.environ.get("EXPO_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    signature = request.headers.get("expo-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing expo-signature header")

    # Raw body for signature verification - don't parse JSON first
    raw_body = await request.body()
    if not verify_expo_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Use payload["id"] + payload["status"] to de-duplicate retried deliveries
    payload_type = classify_payload(payload)
    if payload_type == "BUILD":
        handle_build(payload)
    elif payload_type == "SUBMIT":
        handle_submit(payload)
    else:
        print("Unrecognized Expo payload")

    return {"received": True, "type": payload_type}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
