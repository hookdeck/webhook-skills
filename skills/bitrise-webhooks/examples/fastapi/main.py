# Generated with: bitrise-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_bitrise_request(headers, secret=None, header_name=None) -> bool:
    """Bitrise does not sign payloads. Authenticate with a secret custom header added to the
    outgoing webhook's Headers section. The header name is user-chosen; the expected value is
    the exact, whole header value (a 'Bearer ' prefix, if you typed one, is part of it).
    This is a static shared credential: it authenticates the sender, not the body, and gives
    no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("BITRISE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("BITRISE_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_bitrise_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_bitrise_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def detect_kind(payload: dict) -> str:
    """Release Management bodies have a string trigger_event. Bitrise publishes no payload schema
    for CI build events, so anything else is logged as-is rather than parsed on guessed field names."""
    return "release_management" if isinstance(payload.get("trigger_event"), str) else "other"


def handle_release_event(payload: dict) -> None:
    event = payload.get("trigger_event")
    release_id = payload.get("release_id")

    if event == "app_version_added":
        print(f"App version added to release {release_id}")
        # TODO: record the new version (payload["description"])

    elif event == "testflight_upload_started":
        print(f"TestFlight upload started: {payload.get('file_name')}")

    elif event == "testflight_upload_completed":
        print(f"TestFlight upload completed: {payload.get('file_name')} {payload.get('version')} ({payload.get('version_code')})")
        # TODO: notify QA that the build is uploaded

    elif event == "testflight_upload_failed":
        print(f"TestFlight upload failed: {payload.get('file_name')}")
        # TODO: alert the release owner

    elif event == "testflight_processing_completed":
        print(f"TestFlight processing completed: {payload.get('file_name')}")
        # TODO: announce the build to testers

    elif event == "testflight_processing_failed":
        print(f"TestFlight processing failed: {payload.get('file_name')}")
        # TODO: alert the release owner

    elif event == "testflight_app_review_approved":
        print(f"TestFlight app review approved: {payload.get('testflight_beta_build_id')}")

    elif event == "testflight_app_review_rejected":
        print(f"TestFlight app review rejected: {payload.get('testflight_beta_build_id')}")
        # TODO: alert the release owner

    elif event == "google_play_upload_completed":
        print(f"Google Play upload completed: {payload.get('file_name')} {payload.get('version')} ({payload.get('version_code')})")
        # TODO: notify QA that the build is uploaded

    elif event == "google_play_upload_failed":
        print(f"Google Play upload failed: {payload.get('file_name')}")
        # TODO: alert the release owner

    elif event == "app_store_review_approved":
        print(f"App Store review approved: {payload.get('version')}")

    elif event == "app_store_review_rejected":
        print(f"App Store review rejected: {payload.get('version')} ({payload.get('reason')})")
        # TODO: alert the release owner

    elif event == "app_store_release_completed":
        print(f"App Store release completed for release {release_id}")
        # TODO: announce the release

    elif event == "google_play_release_completed":
        print(f"Google Play release completed for release {release_id}")
        # TODO: announce the release

    else:
        print(f"Unhandled Release Management event: {event}")


def handle_other_event(payload: dict) -> None:
    # Likely a CI build event (build started or finished), whose payload Bitrise doesn't document.
    print(
        "Payload without trigger_event (undocumented, e.g. a CI build event); "
        f"fields: {', '.join(payload.keys())}"
    )
    # TODO: inspect a real delivery under Recent deliveries, then handle the fields you see


def handle_event(payload: dict) -> None:
    if detect_kind(payload) == "release_management":
        handle_release_event(payload)
    else:
        handle_other_event(payload)


@app.post("/webhooks/bitrise", dependencies=[Depends(require_bitrise_secret)])
async def bitrise_webhook(request: Request):
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
        print(f"Error handling Bitrise event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
