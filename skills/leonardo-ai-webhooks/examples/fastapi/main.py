# Generated with: leonardo-ai-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

BEARER = re.compile(r"bearer ", re.IGNORECASE)  # auth schemes are case-insensitive (RFC 9110)


def verify_leonardo_request(headers, configured=None) -> bool:
    """Leonardo.Ai does not sign payloads. If a webhook callback API key is set, every
    callback carries "Authorization: Bearer <key>". The configured secret is the bare
    key; a pasted "Bearer <key>" is tolerated (stripped) like Hookdeck does.
    A static credential authenticates the sender, not the body, and has no replay protection.
    """
    if configured is None:
        configured = os.environ.get("LEONARDO_AI_WEBHOOK_SECRET", "")
    if not configured:
        return False  # never accept when unconfigured
    secret = configured[7:] if BEARER.match(configured) else configured
    if not secret:
        return False  # a configured value of just "Bearer " must not match
    header = headers.get("authorization", "")
    if not BEARER.match(header):
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(header[7:].encode("utf-8"), secret.encode("utf-8"))


async def require_leonardo_key(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_leonardo_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization Bearer key")


def handle_event(payload: dict) -> None:
    event_type = payload.get("type")

    if event_type == "image_generation.complete":
        generation = (payload.get("data") or {}).get("object") or {}
        images = generation.get("images") or []
        # Don't log the whole payload: the documented sample embeds the callback key.
        print(f"Generation {generation.get('id')} {generation.get('status')}: {len(images)} image(s)")
        # TODO: download images[].url, update your job record, notify the user

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/leonardo-ai", dependencies=[Depends(require_leonardo_key)])
async def leonardo_webhook(request: Request):
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
        print(f"Error handling Leonardo.Ai event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
