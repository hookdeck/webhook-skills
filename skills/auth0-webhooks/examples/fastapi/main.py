# Generated with: auth0-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, Response

load_dotenv()

app = FastAPI()

# The token you set as the event stream's bearer authorization.
AUTH0_EVENT_STREAM_TOKEN = os.environ.get("AUTH0_EVENT_STREAM_TOKEN")


def verify_auth0_authorization(header_value: str | None, token: str | None) -> bool:
    """Auth0 Event Streams are not signed. With bearer authorization, Auth0
    sends `Authorization: Bearer <token>` on every request, so compare the
    whole header in constant time."""
    if not header_value or not token:
        return False
    # compare_digest is constant-time and safe for unequal lengths.
    return hmac.compare_digest(header_value.encode(), f"Bearer {token}".encode())


def handle_event(event: dict) -> None:
    """Handle one Auth0 event. Each request carries a single CloudEvents-shaped
    object: `type` says what happened and `data.object` holds the entity."""
    event_type = event.get("type")
    obj = (event.get("data") or {}).get("object") or {}

    if event_type == "user.created":
        print(f"User created: {obj.get('user_id')} (event {event.get('id')} at {event.get('time')})")
        # Your code: create the user in your database

    elif event_type == "user.updated":
        print(f"User updated: {obj.get('user_id')}")
        # Your code: compare `time` with your stored copy before overwriting

    elif event_type == "user.deleted":
        print(f"User deleted: {obj.get('user_id')}")
        # Your code: remove or deactivate the user

    elif event_type == "organization.member.added":
        print(f"Organization member added: event {event.get('id')}")
        # Your code: grant access in your system

    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/auth0", status_code=204)
async def auth0_webhook(request: Request, authorization: str | None = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not verify_auth0_authorization(authorization, AUTH0_EVENT_STREAM_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid Authorization header")

    event = await request.json()

    # Auth0 retries only three times, 1s, 2s and 4s apart, so hand slow work
    # to a queue and return quickly.
    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001 - always acknowledge an authenticated event
        print(f"Error handling event: {err}")

    return Response(status_code=204)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
