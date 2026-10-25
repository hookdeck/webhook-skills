# Generated with: procore-webhooks skill
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


def verify_procore_request(headers, config=os.environ) -> bool:
    """Procore does not sign payloads. The only credential is the optional "Authorization
    Header" value configured on the hook, which Procore places verbatim in the Authorization
    header. Compare the WHOLE header value, including any "Bearer " / "Basic " prefix.
    Never strip, parse or base64-decode it.
    """
    expected = config.get("PROCORE_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_procore_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_procore_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("event_type")
    resource = payload.get("resource_name")
    resource_id = payload.get("resource_id")

    if event_type == "create":
        print(f"{resource} {resource_id} created")
        # TODO: fetch the new record via the Procore REST API and sync it

    elif event_type == "update":
        print(f"{resource} {resource_id} updated")
        # TODO: refresh your copy of the record

    elif event_type == "delete":
        print(f"{resource} {resource_id} deleted")
        # TODO: remove or archive your copy of the record

    else:
        print(f"Unhandled Procore event_type: {event_type}")


@app.post("/webhooks/procore", dependencies=[Depends(require_procore_auth)])
async def procore_webhook(request: Request):
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
        print(f"Error handling Procore webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
