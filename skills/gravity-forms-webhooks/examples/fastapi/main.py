# Generated with: gravity-forms-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import logging
import os
import re
from typing import Any, Optional
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logger = logging.getLogger("gravity_forms")
logging.basicConfig(level=logging.INFO)

app = FastAPI()

# Gravity Forms has no event types: every delivery is a form submission.
# Use a database or cache in production; a set is enough to show the idea.
# Map the entry `id` in the feed's Select Fields mode to be able to deduplicate.
processed: set[str] = set()

FIELD_ID = re.compile(r"^\d+(\.\d+)?$")


def verify_gravity_forms_secret(header_value: Optional[str], secret: Optional[str]) -> bool:
    """Gravity Forms does NOT sign webhooks: there is no signature, HMAC or signing secret.

    Authentication is a custom Request Header you add to the webhook feed under
    Form Settings > Webhooks > Request Headers, e.g.  X-Webhook-Secret: <secret>
    Compare the header value with your secret in constant time.
    """
    if not secret or header_value is None:
        return False  # fail closed when the secret is not configured
    # compare_digest is constant-time and returns False for different lengths
    return hmac.compare_digest(header_value.encode("utf-8"), secret.encode("utf-8"))


def parse_entry(raw_body: bytes, content_type: Optional[str]) -> dict[str, Any]:
    """The body is the entry: JSON or urlencoded, per the feed's Request Format.

    Keys are field IDs ("1", "2.3" for sub-inputs) plus entry properties (id, form_id,
    date_created, source_url, ...). With "Select Fields" it holds only the keys you mapped.
    """
    text = raw_body.decode("utf-8")
    if re.search(r"application/(.+\+)?json", content_type or "", re.IGNORECASE):
        body = json.loads(text)
        if not isinstance(body, dict):
            raise ValueError("Expected a JSON object")
        return body
    return dict(parse_qsl(text, keep_blank_values=True))


def field_values(entry: dict[str, Any]) -> dict[str, Any]:
    """Field values are the keys that look like field IDs: "1", "2.3"."""
    return {key: value for key, value in entry.items() if FIELD_ID.match(key)}


def dedupe_key(entry: dict[str, Any]) -> Optional[str]:
    entry_id = entry.get("id")
    return f"{entry.get('form_id', '')}:{entry_id}" if entry_id else None


def handle_submission(entry: dict[str, Any]) -> None:
    logger.info(
        "Form submission: form %s, entry %s: %s",
        entry.get("form_id", "(unmapped)"),
        entry.get("id", "(unmapped)"),
        field_values(entry),
    )
    # TODO: route on entry["form_id"], save the entry, notify your team, etc.


@app.post("/webhooks/gravity-forms")
async def gravity_forms_webhook(request: Request):
    secret = os.environ.get("GRAVITY_FORMS_WEBHOOK_SECRET")
    if not secret:
        logger.error("GRAVITY_FORMS_WEBHOOK_SECRET is not set; rejecting webhook")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)

    # Authenticate before reading the body
    header_name = os.environ.get("GRAVITY_FORMS_WEBHOOK_HEADER", "x-webhook-secret")
    if not verify_gravity_forms_secret(request.headers.get(header_name), secret):
        return JSONResponse(
            {"error": "Invalid or missing webhook secret header"}, status_code=401
        )

    try:
        entry = parse_entry(await request.body(), request.headers.get("content-type"))
    except (ValueError, UnicodeDecodeError):  # JSONDecodeError is a ValueError
        return JSONResponse({"error": "Invalid request body"}, status_code=400)

    key = dedupe_key(entry)
    if key and key in processed:
        return {"received": True, "duplicate": True}

    try:
        handle_submission(entry)
    except Exception:
        logger.exception("Error handling Gravity Forms submission")
        return JSONResponse({"error": "Processing failed"}, status_code=500)

    if key:
        processed.add(key)
    return {"received": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
