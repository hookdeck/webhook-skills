# Generated with: live-tennis-api-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "sha256="


def verify_live_tennis_signature(raw_body: bytes, header: str, secret: str) -> bool:
    """Verify X-LTAPI-Signature: "sha256=<hex HMAC-SHA256 of the raw body>".

    X-LTAPI-Timestamp is NOT signed, so it plays no part here.
    """
    if not header.startswith(SIGNATURE_PREFIX):
        return False
    received = header[len(SIGNATURE_PREFIX):].lower()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500.
    # It is timing-safe, and different lengths simply compare unequal.
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/live-tennis-api")
async def live_tennis_api_webhook(request: Request):
    secret = os.getenv("LIVE_TENNIS_API_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Server configuration error")

    signature = request.headers.get("x-ltapi-signature")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-LTAPI-Signature header")

    # IMPORTANT: use the raw bytes, whatever the Content-Type; don't parse JSON first
    raw_body = await request.body()

    if not verify_live_tennis_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        frame = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    if not isinstance(frame, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    # The signed body carries the frame type; X-LTAPI-Event (unsigned) is the fallback.
    # Delivery is at-most-once: dedupe score frames on `sequence` and point frames on `point.seq`.
    event = frame.get("type") or request.headers.get("x-ltapi-event")
    print(f"Received Live Tennis API frame: {event} (match {frame.get('match_id')})")

    if event == "score":
        print("Score:", frame.get("match_id"), frame.get("sets"), frame.get("games"), frame.get("points"))
        # TODO: update your scoreboard (each score frame is the complete current score)
    elif event == "point":
        point = frame.get("point") or {}
        print("Point:", frame.get("match_id"), point.get("seq"), "won by", point.get("winner"))
        # TODO: store the point keyed on (match_id, point.seq); recover gaps via GET /matches/{id}/points?after_seq=
    elif event == "break_point":
        print("Break point:", frame.get("match_id"), "server", frame.get("server"), "returner", frame.get("returner"))
        # TODO: raise an alert
    elif event == "break_point_result":
        print("Break point result:", frame.get("match_id"), frame.get("outcome"))
        # TODO: settle the break point (outcome is "held" or "broken")
    else:
        print("Unhandled Live Tennis API event:", event)

    return {"received": True, "event": event}
