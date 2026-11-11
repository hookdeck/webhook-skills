# Generated with: bundle-social-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_bundle_social_signature(raw_body: bytes, signature: Optional[str], secret: str) -> bool:
    """Verify a bundle.social webhook.

    bundle.social has no Python SDK, so verify manually: the x-signature header is
    the hex HMAC-SHA256 of the raw request body, keyed with the signing secret.
    """
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Timing-safe comparison on bytes (compare_digest raises on non-ASCII str input)
    return hmac.compare_digest(expected.encode("utf-8"), signature.encode("utf-8"))


async def verified_bundle_social_event(request: Request) -> dict:
    """FastAPI dependency: verify the raw body, then parse it."""
    raw_body = await request.body()  # raw bytes - never parse before verifying
    signature = request.headers.get("x-signature")
    secret = os.environ.get("BUNDLE_SOCIAL_WEBHOOK_SECRET", "")

    if not verify_bundle_social_signature(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        return json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")


@app.post("/webhooks/bundle-social")
async def bundle_social_webhook(event: dict = Depends(verified_bundle_social_event)):
    # Every delivery is {"type": ..., "data": {...}}. bundle.social may add event
    # types at any time (webhooks with no event filter receive them), so ignore unknowns.
    event_type = event.get("type")
    data = event.get("data") or {}

    if event_type == "post.published":
        # Fires for successes AND permanent failures - check data.status.
        if data.get("status") == "POSTED":
            print(f"Post {data.get('id')} is live: {data.get('externalData')}")
        else:
            print(f"Post {data.get('id')} failed ({data.get('status')}): {data.get('error') or data.get('errors')}")
    elif event_type == "post.externally-deleted":
        print(f"Post {data.get('postId') or data.get('id')} was deleted on {data.get('socialAccountType')}")
    elif event_type == "comment.published":
        print(f"Comment {data.get('id')} finished with status {data.get('status')}")
    elif event_type == "social-account.created":
        print(f"Social account connected: {data.get('type')} @{data.get('username')}")
    elif event_type == "social-account.updated":
        # socialAction is present for disconnection checks and failed token refreshes
        delete_on = ((data.get("socialAction") or {}).get("details") or {}).get("deleteOn")
        suffix = f" - reconnect before {delete_on}" if delete_on else ""
        print(f"Social account updated: {data.get('id')}{suffix}")
    elif event_type == "social-account.deleted":
        print(f"Social account removed: {data.get('id')}")
    elif event_type == "team.created":
        print(f"Team created: {data.get('name')} ({data.get('id')})")
    elif event_type == "team.updated":
        print(f"Team updated: {data.get('id')}")
    elif event_type == "team.deleted":
        print(f"Team deleted: {data.get('id')}")
    else:
        print(f"Unhandled bundle.social event type: {event_type}")

    # Respond 2xx within 15 seconds; move slow work to a queue.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
