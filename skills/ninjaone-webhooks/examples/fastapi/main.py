# Generated with: ninjaone-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import logging
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("ninjaone")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Use a database or cache in production; a set is enough to show the idea.
processed: set[str] = set()


def verify_ninjaone_secret(header_value: Optional[str], secret: Optional[str]) -> bool:
    """NinjaOne does NOT sign webhooks: there is no signature header and no HMAC.

    Authentication is the custom header you set when configuring the webhook via the API
    (PUT /v2/webhook, "headers": [{"name": "X-Webhook-Secret", "value": "<secret>"}]).
    """
    if not secret or header_value is None:
        return False  # fail closed when NINJAONE_WEBHOOK_SECRET is unset
    # compare_digest is constant-time and returns False for different lengths
    return hmac.compare_digest(header_value.encode("utf-8"), secret.encode("utf-8"))


def dedupe_key(activity: dict[str, Any]) -> Optional[str]:
    """An activity is identified by activityType + statusCode (e.g. CONDITION + TRIGGERED)."""
    if activity.get("id") is None:
        return None
    return f"{activity['id']}:{activity.get('statusCode')}"


def handle_activity(activity: dict[str, Any]) -> None:
    activity_type = activity.get("activityType")
    status_code = activity.get("statusCode")
    device_id = activity.get("deviceId")
    if activity_type == "CONDITION":
        # A monitoring condition fired (TRIGGERED) or cleared (RESET)
        if status_code == "TRIGGERED":
            logger.info(
                "Condition triggered on device %s: %s (severity %s)",
                device_id, activity.get("message"), activity.get("severity"),
            )
        elif status_code == "RESET":
            logger.info("Condition reset on device %s: %s", device_id, activity.get("message"))
        else:
            logger.info("Condition %s on device %s", status_code, device_id)
    elif activity_type in ("ACTION", "ACTIONSET"):
        # Scripts and automations: STARTED, COMPLETED, CANCELLED, ...
        logger.info(
            "%s %s on device %s: %s", activity_type, status_code, device_id, activity.get("subject")
        )
    else:
        logger.info("Unhandled activity %s/%s", activity_type, status_code)
    # TODO: open a ticket, page on-call, sync your CMDB, etc.


@app.post("/webhooks/ninjaone")
async def ninjaone_webhook(
    request: Request, x_webhook_secret: Optional[str] = Header(default=None)
):
    secret = os.environ.get("NINJAONE_WEBHOOK_SECRET")
    if not secret:
        logger.error("NINJAONE_WEBHOOK_SECRET is not set; rejecting webhook")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Authenticate before reading the body
    if not verify_ninjaone_secret(x_webhook_secret, secret):
        return JSONResponse(
            {"error": "Invalid or missing X-Webhook-Secret header"}, status_code=401
        )

    try:
        activity = json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)
    if not isinstance(activity, dict) or not activity.get("activityType"):
        return JSONResponse(
            {"error": "Expected an activity object with activityType"}, status_code=400
        )

    key = dedupe_key(activity)
    if key and key in processed:
        return {"received": True, "duplicate": True}

    try:
        handle_activity(activity)
    except Exception:
        logger.exception("Error handling NinjaOne activity")
        return JSONResponse({"error": "Processing failed"}, status_code=500)

    if key:
        processed.add(key)
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
