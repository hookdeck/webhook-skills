# Generated with: apify-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. compare_digest takes bytes: passing str raises on non-ASCII."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_apify_request(headers, secret=None) -> bool:
    """Apify does not sign payloads. Authenticate with a secret header added through the
    webhook's Headers template. The header name is user-chosen (APIFY_WEBHOOK_HEADER) and
    the whole value is compared as-is (APIFY_WEBHOOK_SECRET), including any "Bearer " prefix.

    This authenticates the sender, not the body, and gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("APIFY_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    name = os.environ.get("APIFY_WEBHOOK_HEADER") or "X-Webhook-Secret"
    received = headers.get(name.lower())  # Starlette headers are case-insensitive; plain dicts need lowercase
    return bool(received) and safe_equal(received, secret)


async def require_apify_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_apify_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    event_type = payload.get("eventType")
    event_data = payload.get("eventData") or {}
    run_id = event_data.get("actorRunId")
    build_id = event_data.get("actorBuildId")

    if event_type == "ACTOR.RUN.CREATED":
        print(f"Run created: {run_id}")

    elif event_type == "ACTOR.RUN.SUCCEEDED":
        print(f"Run succeeded: {run_id}")
        # TODO: fetch results from /v2/actor-runs/{actorRunId}/dataset/items

    elif event_type == "ACTOR.RUN.FAILED":
        print(f"Run failed: {run_id}")
        # TODO: alert or open a ticket

    elif event_type == "ACTOR.RUN.ABORTED":
        print(f"Run aborted: {run_id}")

    elif event_type == "ACTOR.RUN.TIMED_OUT":
        print(f"Run timed out: {run_id}")
        # TODO: alert or retry with a longer timeout

    elif event_type == "ACTOR.RUN.RESURRECTED":
        print(f"Run resurrected: {run_id}")

    elif event_type == "ACTOR.BUILD.CREATED":
        print(f"Build created: {build_id}")

    elif event_type == "ACTOR.BUILD.SUCCEEDED":
        print(f"Build succeeded: {build_id}")

    elif event_type == "ACTOR.BUILD.FAILED":
        print(f"Build failed: {build_id}")
        # TODO: alert the Actor owner

    elif event_type == "ACTOR.BUILD.ABORTED":
        print(f"Build aborted: {build_id}")

    elif event_type == "ACTOR.BUILD.TIMED_OUT":
        print(f"Build timed out: {build_id}")

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/apify", dependencies=[Depends(require_apify_secret)])
async def apify_webhook(request: Request):
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
        print(f"Error handling Apify event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
