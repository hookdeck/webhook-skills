# Generated with: slack-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import time

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()


def verify_slack_request(
    raw_body: bytes,
    signature_header: str | None,
    timestamp_header: str | None,
    signing_secret: str | None,
) -> bool:
    """Verify an Events API request from Slack.

    Slack signs ``v0:{timestamp}:{raw_body}`` with HMAC-SHA256 using the app's
    signing secret and sends the result as ``X-Slack-Signature: v0=<hex>``.
    """
    if not signature_header or not timestamp_header or not signing_secret:
        return False

    try:
        timestamp = int(timestamp_header)
    except ValueError:
        return False

    # Replay protection: reject requests older than 5 minutes
    if abs(time.time() - timestamp) > 60 * 5:
        return False

    # Slack signs the literal string: "v0:" + timestamp + ":" + raw body
    basestring = f"v0:{timestamp}:{raw_body.decode('utf-8')}".encode("utf-8")
    expected = "v0=" + hmac.new(
        signing_secret.encode("utf-8"),
        basestring,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(expected, signature_header)


@app.post("/webhooks/slack")
async def slack_webhook(request: Request):
    raw_body = await request.body()
    signature_header = request.headers.get("x-slack-signature")
    timestamp_header = request.headers.get("x-slack-request-timestamp")
    signing_secret = os.environ.get("SLACK_SIGNING_SECRET")

    if not verify_slack_request(raw_body, signature_header, timestamp_header, signing_secret):
        return PlainTextResponse("Invalid signature", status_code=401)

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    # One-time url_verification challenge when configuring the Request URL
    if payload.get("type") == "url_verification":
        return JSONResponse({"challenge": payload.get("challenge")})

    if payload.get("type") == "event_callback":
        event = payload.get("event") or {}
        event_type = event.get("type")

        print(f"Received {event_type} (event_id: {payload.get('event_id')})")

        if event_type == "app_mention":
            print(
                f"Mentioned by {event.get('user')} in {event.get('channel')}: {event.get('text')}"
            )
            # TODO: Reply via chat.postMessage

        elif event_type == "message":
            print(
                f"Message from {event.get('user')} in {event.get('channel')}: {event.get('text')}"
            )
            # TODO: Moderation, logging, automation

        elif event_type == "reaction_added":
            print(f"Reaction :{event.get('reaction')}: added by {event.get('user')}")
            # TODO: Approval workflows, polls

        elif event_type == "reaction_removed":
            print(f"Reaction :{event.get('reaction')}: removed by {event.get('user')}")

        elif event_type == "team_join":
            user = event.get("user")
            user_id = user.get("id") if isinstance(user, dict) else user
            print(f"New team member joined: {user_id}")
            # TODO: Onboarding DM, CRM sync

        elif event_type == "member_joined_channel":
            print(f"{event.get('user')} joined channel {event.get('channel')}")

        elif event_type == "app_home_opened":
            print(f"App home opened by {event.get('user')}")
            # TODO: Publish the App Home view

        else:
            print(f"Unhandled event type: {event_type}")

    # Slack requires a 2xx response within 3 seconds, or it will retry
    return PlainTextResponse("OK", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
