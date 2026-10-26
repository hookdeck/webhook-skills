# Generated with: mighty-networks-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Retries redeliver the same event_id. Use a durable store (Redis, a DB unique key) in production.
seen_event_ids: set = set()


def has_bearer(value) -> bool:
    return isinstance(value, str) and value[:7].lower() == "bearer "


def verify_mighty_networks_request(headers, secret=None) -> bool:
    """Mighty Networks does not sign payloads. It sends the API key you configured with the
    webhook as "Authorization: Bearer <key>". The scheme matches in any case (RFC 9110); the key
    is compared exactly, in constant time.

    MIGHTY_NETWORKS_WEBHOOK_SECRET holds the bare key. If it starts with "Bearer " it is stripped.
    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("MIGHTY_NETWORKS_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    expected = secret[7:] if has_bearer(secret) else secret
    if not expected:
        return False  # a configured value of just "Bearer " must not match
    auth = headers.get("authorization")
    if not expected or not has_bearer(auth):
        return False
    # Compare bytes: compare_digest raises TypeError on a non-ASCII str.
    return hmac.compare_digest(auth[7:].encode("utf-8"), expected.encode("utf-8"))


def normalize_event_type(event_type) -> str:
    """event_type arrives as "PostCreatedHook"; the docs name the event "PostCreated"."""
    if not isinstance(event_type, str):
        return ""
    return event_type[: -len("Hook")] if event_type.endswith("Hook") else event_type


async def require_mighty_networks_key(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_mighty_networks_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization Bearer key")


def handle_event(event_type: str, payload: dict) -> None:
    if event_type == "MemberJoined":
        print(f"Member joined space {payload.get('space_id')}")
        # TODO: welcome the member, sync to your CRM (payload["member"])

    elif event_type == "MemberLeft":
        print(f"Member left space {payload.get('space_id')}")
        # TODO: record churn (payload["member"], payload["reason"])

    elif event_type == "MemberPurchased":
        print("Member purchased a plan")
        # TODO: grant access (payload["member"], payload["plan"], payload["purchase"])

    elif event_type == "MemberPurchaseRequested":
        print("Member requested a purchase")
        # TODO: approve or follow up (payload["member_email"], payload["plan_id"])

    elif event_type == "MemberSubscriptionRenewed":
        print("Subscription renewed")
        # TODO: extend access (payload["member"], payload["subscription"])

    elif event_type == "MemberSubscriptionCanceled":
        print("Subscription canceled")
        # TODO: start a win-back flow (payload["member"], payload["subscription"])

    elif event_type == "MemberPlanChanged":
        print("Member changed plan")
        # TODO: adjust entitlements (payload["plan"])

    elif event_type == "MemberRemovedFromPlan":
        print("Member removed from plan")
        # TODO: revoke access

    elif event_type == "PostCreated":
        print(f"Post created: {payload.get('title')}")
        # TODO: moderate or cross-post (payload["id"], payload["space_id"])

    elif event_type == "PostUpdated":
        print(f"Post updated: {payload.get('title')}")
        # TODO: re-sync the post

    elif event_type == "CommentCreated":
        print(f"Comment created on {payload.get('targetable_type')} {payload.get('targetable_id')}")
        # TODO: notify (payload["text"], payload["author_id"])

    elif event_type == "RsvpCreated":
        print(f"RSVP created: {payload.get('status')}")
        # TODO: update the attendee list (payload["event"], payload["member"])

    elif event_type == "EventCreated":
        print(f"Event created: {payload.get('title')}")
        # TODO: add to your calendar (payload["starts_at"])

    elif event_type == "EventCanceled":
        print(f"Event canceled: {payload.get('title')}")
        # TODO: notify attendees

    elif event_type == "ReportedContentCreated":
        print("Content reported")
        # TODO: queue for moderation (payload["reported_content"])

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/mighty-networks", dependencies=[Depends(require_mighty_networks_key)])
async def mighty_networks_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    event_id = body.get("event_id")
    if isinstance(event_id, str) and event_id in seen_event_ids:
        return {"received": True, "duplicate": True}

    payload = body.get("payload")
    try:
        handle_event(
            normalize_event_type(body.get("event_type")),
            payload if isinstance(payload, dict) else {},
        )
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Mighty Networks event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    if isinstance(event_id, str):
        seen_event_ids.add(event_id)  # after success, so a failed event is retried
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
