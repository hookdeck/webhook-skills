# Generated with: auth0-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

AUTH0_LOG_STREAM_TOKEN = os.environ.get("AUTH0_LOG_STREAM_TOKEN")


def verify_auth0_token(header_value: str | None, expected_token: str | None) -> bool:
    """Auth0 Custom Log Streams are not signed. Authenticate the request by
    constant-time comparing the incoming Authorization header against the token
    configured on the log stream."""
    if not header_value or not expected_token:
        return False
    # compare_digest is constant-time and safe for unequal lengths.
    return hmac.compare_digest(header_value, expected_token)


def handle_event(event: dict) -> None:
    """Process a single Auth0 log record. The type code is at data.type."""
    data = event.get("data", event)
    event_type = data.get("type")

    if event_type == "s":
        print(f"Success login: {data.get('user_name') or data.get('user_id')}")
        # TODO: update last-login, send "new login" notification, etc.

    elif event_type == "f":
        print(f"Failed login from {data.get('ip')}: {data.get('description')}")
        # TODO: fraud/brute-force detection, alerting, etc.

    elif event_type == "ss":
        print(f"Success signup: {data.get('user_name') or data.get('user_id')}")
        # TODO: provision the user, send welcome email, CRM sync, etc.

    elif event_type == "fs":
        print(f"Failed signup: {data.get('description')}")
        # TODO: debug registration flow, alerting, etc.

    elif event_type == "sepft":
        print(f"Token exchange (password grant) for {data.get('user_name') or data.get('user_id')}")
        # TODO: token issuance auditing, etc.

    else:
        print(f"Unhandled event type: {event_type}")


@app.post("/webhooks/auth0")
async def auth0_webhook(request: Request, authorization: str | None = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    if not verify_auth0_token(authorization, AUTH0_LOG_STREAM_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid Authorization token")

    # Auth0 batches events — the body is an array (be defensive about a single object).
    body = await request.json()
    events = body if isinstance(body, list) else [body]

    for event in events:
        try:
            handle_event(event)
        except Exception as err:  # noqa: BLE001 - keep processing the batch
            print(f"Error handling event: {err}")

    # Acknowledge — Auth0 retries on any non-2xx response.
    return {"received": len(events)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
