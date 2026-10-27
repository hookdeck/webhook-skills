# Generated with: chameleon-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_SHA256 = re.compile(r"[0-9a-fA-F]{64}")

# Demo dedupe store. Use a durable store (Redis, DB unique key) in production.
seen_event_ids: set = set()


def verify_chameleon_signature(raw_body: bytes, signature: Optional[str], secret: Optional[str] = None) -> bool:
    """Chameleon signs the RAW request body: X-Chameleon-Signature is the bare hex
    HMAC-SHA256 of the body, keyed with the Webhook Secret (UTF-8 bytes, as-is).
    Nothing else (no timestamp, no id) is part of the signed content.
    """
    secret = secret if secret is not None else os.environ.get("CHAMELEON_WEBHOOK_SECRET")
    if not secret or not signature or not HEX_SHA256.fullmatch(signature):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Hex is case-insensitive; compare_digest on bytes (never str).
    return hmac.compare_digest(signature.lower().encode("ascii"), expected.encode("ascii"))


def sent_at_within_tolerance(sent_at, tolerance_seconds: float, now: Optional[datetime] = None) -> bool:
    """Optional replay check from Chameleon's sample: sent_at must be within N seconds of now.
    Off unless CHAMELEON_SENT_AT_TOLERANCE_SECONDS is set. Runs after the signature check.
    """
    if not isinstance(sent_at, str):
        return False
    try:
        parsed = datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    now = now or datetime.now(timezone.utc)
    return abs((now - parsed).total_seconds()) <= tolerance_seconds


def handle_event(event: dict) -> None:
    kind = event.get("kind")
    data = event.get("data") or {}
    profile = data.get("profile") or {}
    who = profile.get("uid") or profile.get("email") or profile.get("id") or "unknown user"

    if kind == "ping":
        print(f"Ping from account {(data.get('account') or {}).get('domain')}")

    elif kind in ("tour.started", "tour.completed", "tour.exited", "tour.snoozed", "tour.button.clicked"):
        print(f"{kind}: {(data.get('tour') or {}).get('name')} ({who})")
        # TODO: record onboarding progress for the user

    elif kind in ("survey.started", "survey.completed", "survey.exited", "survey.snoozed", "survey.button.clicked"):
        print(f"{kind}: {(data.get('survey') or {}).get('name')} ({who})")
        # TODO: record survey progress

    elif kind == "response.finished":
        print(f"Survey answered: \"{(data.get('response') or {}).get('button_text')}\" ({who})")
        # TODO: store response.button_text and response.input_text

    elif kind in ("embed.started", "embed.completed", "embed.exited", "embed.snoozed", "embed.button.clicked"):
        print(f"{kind}: {(data.get('embed') or {}).get('name')} ({who})")

    elif kind in ("demo.started", "demo.reveal", "demo.finished", "demo.form.submitted", "demo.email.added"):
        print(f"{kind}: {(data.get('demo') or {}).get('name')} ({who})")
        # TODO: sync the lead or engagement to your CRM

    elif kind in ("helpbar.search", "helpbar.answer", "helpbar.item.action", "helpbar.item.error"):
        print(f"{kind}: \"{(data.get('action') or {}).get('query')}\" ({who})")
        # TODO: feed search analytics

    elif kind == "alert.triggered":
        print("Chameleon alert triggered")
        # TODO: notify your team

    else:
        print(f"Unhandled event: {kind}")


@app.post("/webhooks/chameleon")
async def chameleon_webhook(request: Request):
    # Raw bytes: verify exactly what Chameleon signed, then parse.
    raw_body = await request.body()

    if not verify_chameleon_signature(raw_body, request.headers.get("x-chameleon-signature")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict) or not isinstance(event.get("kind"), str):
        raise HTTPException(status_code=400, detail="Expected a JSON object with a kind")

    try:
        tolerance = float(os.environ.get("CHAMELEON_SENT_AT_TOLERANCE_SECONDS") or 0)
    except ValueError:
        tolerance = 0
    if tolerance > 0 and not sent_at_within_tolerance(event.get("sent_at"), tolerance):
        raise HTTPException(status_code=400, detail="sent_at is outside the allowed window")

    # Chameleon retries non-200 responses, so dedupe on the webhook id.
    event_id = event.get("id")
    if event_id and event_id in seen_event_ids:
        return {"received": True, "duplicate": True}

    try:
        handle_event(event)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Chameleon event: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    if event_id:
        seen_event_ids.add(event_id)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
