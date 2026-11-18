# Generated with: surveymonkey-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""SurveyMonkey webhook receiver for FastAPI.

SurveyMonkey callbacks are POSTs with Sm-Apikey (your client ID, or API key for
old-auth apps) and Sm-Signature: the base64 HMAC-SHA1 of the raw body, keyed
with the literal string "<client ID>&<client secret>". SurveyMonkey also sends
a HEAD request when a webhook is created or replaced, and the URL must answer
200 (unless the API call passes bypass_ping=true).
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Optional, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("surveymonkey-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SurveyMonkey Webhook Handler")


def verify_surveymonkey_signature(
    raw_body: Union[bytes, str],
    signature: Optional[str],
    client_id: Optional[str],
    client_secret: Optional[str],
) -> bool:
    """Verify Sm-Signature against the exact bytes SurveyMonkey sent."""
    cid = (client_id or "").strip()
    secret = (client_secret or "").strip()
    value = (signature or "").strip()
    # SHA-1 is 20 bytes: 28 base64 characters with one '='.
    if not cid or not secret or not re.fullmatch(r"[A-Za-z0-9+/]{27}=", value):
        return False
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    expected = hmac.new(f"{cid}&{secret}".encode("utf-8"), raw_body, hashlib.sha1).digest()
    return hmac.compare_digest(base64.b64decode(value), expected)


def handle_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """The body names the event and the IDs involved. It doesn't include the
    response itself: fetch it from the API with the IDs in resources."""
    event_type = event.get("event_type")
    resources = event.get("resources") or {}
    if event_type == "response_completed":
        logger.info("Response %s completed for survey %s", event.get("object_id"), resources.get("survey_id"))
    elif event_type and event_type.startswith(("response_", "survey_", "collector_")):
        logger.info("%s: %s %s", event_type, event.get("object_type"), event.get("object_id"))
    elif event_type in ("app_installed", "app_uninstalled"):
        logger.info("%s by user %s", event_type, resources.get("user_id"))
    else:
        logger.info("Unhandled SurveyMonkey event: %s", event_type)
    return {"received": True, "event_type": event_type, "event_id": event.get("event_id")}


@app.head("/webhooks/surveymonkey")
async def surveymonkey_head_check():
    """SurveyMonkey checks the URL with a HEAD request when the webhook is
    created or replaced. It carries no signature: answer 200 and do nothing else."""
    return Response(status_code=200)


@app.post("/webhooks/surveymonkey")
async def surveymonkey_webhook(request: Request):
    client_id = os.environ.get("SURVEYMONKEY_CLIENT_ID", "")
    client_secret = os.environ.get("SURVEYMONKEY_CLIENT_SECRET", "")
    if not client_id.strip() or not client_secret.strip():
        logger.error("SURVEYMONKEY_CLIENT_ID and SURVEYMONKEY_CLIENT_SECRET must both be set: rejecting request")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Read the raw bytes: the HMAC covers the exact body. The Content-Type is
    # application/vnd.surveymonkey.<object>.v1+json, so don't rely on JSON detection.
    raw_body = await request.body()
    if not verify_surveymonkey_signature(raw_body, request.headers.get("sm-signature"), client_id, client_secret):
        return JSONResponse({"error": "Invalid signature"}, status_code=401)

    try:
        event = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    return handle_event(event)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
