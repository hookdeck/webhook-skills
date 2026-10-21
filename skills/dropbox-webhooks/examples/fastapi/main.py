# Generated with: dropbox-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI()


def verify_signature(raw_body: bytes, signature: Optional[str], app_secret: Optional[str]) -> bool:
    """X-Dropbox-Signature is the hex HMAC-SHA256 of the raw body, keyed with the app secret."""
    if not signature or not app_secret:
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(signature, expected)


def process_account_changes(account_id: str) -> None:
    # Call /files/list_folder/continue with the stored cursor for this account,
    # save the new cursor, and repeat while has_more is true.
    print(f"Dropbox: list_folder changes for {account_id}")


# Verification request: Dropbox sends GET ?challenge=<value> when the URI is added.
# Echo it back as text/plain with nosniff.
@app.get("/webhooks/dropbox")
async def dropbox_challenge(challenge: Optional[str] = None):
    if challenge is None:
        raise HTTPException(status_code=400, detail="Missing challenge")
    return PlainTextResponse(
        challenge,
        status_code=200,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.post("/webhooks/dropbox")
async def dropbox_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_dropbox_signature: Optional[str] = Header(None),
):
    # Raw body is required for signature verification
    raw_body = await request.body()

    if not verify_signature(raw_body, x_dropbox_signature, os.getenv("DROPBOX_APP_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Dropbox sends change pings, not event types: fetch the changes with the API,
    # after responding (Dropbox expects a response within 10 seconds)
    accounts = (payload.get("list_folder") or {}).get("accounts") or []
    for account_id in accounts:
        background_tasks.add_task(process_account_changes, account_id)

    return {"received": True}
