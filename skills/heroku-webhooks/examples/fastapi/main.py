# Generated with: heroku-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, Response

load_dotenv()

app = FastAPI()


def verify_heroku_webhook(raw_body: bytes, hmac_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify Heroku-Webhook-Hmac-SHA256: base64(HMAC-SHA256(secret, raw body)).

    The secret is used as a raw string (not base64-decoded).
    """
    if not hmac_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    return hmac.compare_digest(hmac_header.encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/heroku")
async def heroku_webhook(
    request: Request,
    heroku_webhook_hmac_sha256: Optional[str] = Header(default=None),
    authorization: Optional[str] = Header(default=None),
):
    # Get the raw body for signature verification
    raw_body = await request.body()

    if not verify_heroku_webhook(
        raw_body, heroku_webhook_hmac_sha256, os.environ.get("HEROKU_WEBHOOK_SECRET")
    ):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Optional extra: the --authorization value is passed through unmodified
    expected_auth = os.environ.get("HEROKU_WEBHOOK_AUTHORIZATION")
    if expected_auth and not hmac.compare_digest(
        (authorization or "").encode("utf-8"), expected_auth.encode("utf-8")
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Parse the payload after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Subscriptions use "api:release"; payloads may carry "release". Accept both.
    resource = str(event.get("resource") or "").removeprefix("api:")
    action = event.get("action")
    data = event.get("data") or {}

    print(f"Received {resource} {action} webhook (event {event.get('id')})")

    key = f"{resource}:{action}"
    if key in ("release:create", "release:update"):
        print(f"Release v{data.get('version')} {action}: status={data.get('status')}")
        # TODO: Notify deploy channel, record release, etc.

    elif key in ("build:create", "build:update"):
        print(f"Build {data.get('id')} {action}: status={data.get('status')}")
        # TODO: Track build progress, alert on failure, etc.

    elif key in ("app:create", "app:update", "app:destroy"):
        print(f"App {data.get('name')} {action}")
        # TODO: Sync app inventory, etc.

    elif key == "dyno:create":
        print(f"Dyno started: {data.get('name')}")
        # TODO: Track dyno activity, etc.

    elif key in ("formation:update", "formation:destroy"):
        print(f"Formation {data.get('type')} {action}: quantity={data.get('quantity')}")
        # TODO: Track scaling changes, etc.

    elif key in ("addon-attachment:create", "addon-attachment:destroy"):
        print(f"Add-on attachment {data.get('name')} {action}")
        # TODO: Update add-on inventory, etc.

    else:
        print(f"Unhandled event: {resource} {action}")

    # Heroku ignores the body; any 2xx counts as delivered
    return Response(status_code=204)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
