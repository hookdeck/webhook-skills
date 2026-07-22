# Generated with: facebook-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json

from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import PlainTextResponse

load_dotenv()

app = FastAPI()

APP_SECRET = os.environ.get("FACEBOOK_APP_SECRET", "")
VERIFY_TOKEN = os.environ.get("FACEBOOK_VERIFY_TOKEN", "")


def verify_facebook_signature(raw_body: bytes, signature_header: str, app_secret: str) -> bool:
    """Verify a Facebook webhook signature.

    Meta signs the RAW request body with HMAC-SHA256 keyed on your App Secret and
    sends the digest in X-Hub-Signature-256 as ``sha256=<hex>``. Verify over the
    raw bytes BEFORE parsing JSON — Meta signs an escaped-unicode form of the
    payload, so a re-serialized JSON string will not match.
    """
    if not signature_header:
        return False

    # Header format: sha256=<hex>
    algo, _, signature = signature_header.partition("=")
    if algo != "sha256" or not signature:
        return False

    expected_signature = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)


def handle_entry(obj: str, entry: dict) -> None:
    """Dispatch a single entry. A POST can batch up to 1000 updates, so handle
    each entry individually."""
    # Messenger deliveries carry a `messaging` array instead of `changes`.
    if isinstance(entry.get("messaging"), list):
        for event in entry["messaging"]:
            sender = event.get("sender", {}).get("id")
            text = event.get("message", {}).get("text")
            print(f"Messenger message from {sender}: {text}")
            # TODO: Route to your chatbot / support system.
        return

    for change in entry.get("changes", []):
        field = change.get("field")
        value = change.get("value", {})
        key = f"{obj}:{field}"

        if key == "page:feed":
            print(f"Page feed change: {value.get('item')} {value.get('verb')}")
        elif key == "page:mention":
            print(f"Page mentioned: {value.get('post_id')}")
        elif key == "page:messages":
            print(f"Page message field change: {value}")
        elif key == "instagram:comments":
            print(f"Instagram comment: {value.get('id')}")
        elif key == "instagram:mentions":
            print(f"Instagram mention: {value.get('media_id')}")
        elif key == "user:feed":
            print(f"User feed update: {value.get('verb')}")
        else:
            print(f"Unhandled (object, field): ({obj}, {field})")


@app.get("/webhooks/facebook")
async def verify_webhook(request: Request):
    """GET verification handshake — Meta sends this when the Callback URL is saved."""
    params = request.query_params
    mode = params.get("hub.mode")
    token = params.get("hub.verify_token")
    challenge = params.get("hub.challenge")

    if mode == "subscribe" and token == VERIFY_TOKEN:
        # Echo the challenge back verbatim to complete verification.
        return PlainTextResponse(content=challenge or "", status_code=200)

    raise HTTPException(status_code=403, detail="Forbidden")


@app.post("/webhooks/facebook")
async def receive_webhook(request: Request):
    """POST event delivery — use the raw body for signature verification."""
    raw_body = await request.body()
    signature_header = request.headers.get("x-hub-signature-256")

    if not verify_facebook_signature(raw_body, signature_header, APP_SECRET):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification.
    payload = json.loads(raw_body)
    obj = payload.get("object")
    entries = payload.get("entry", [])

    print(f"Received {obj} webhook with {len(entries)} entr(y/ies)")

    for entry in entries:
        handle_entry(obj, entry)

    # Acknowledge quickly; process heavy work asynchronously.
    return PlainTextResponse(content="EVENT_RECEIVED", status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
