# Generated with: zoho-flow-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Zoho Flow Send Webhook receiver for FastAPI.

Zoho Flow's Send Webhook action is NOT signed. Have it send a secret header:
an API Key auth profile with header placement (Parameter Name = header name),
or a header Param Name / Param Value on an action with No Authentication.
The method is yours to choose (GET/PUT/POST/PATCH/DELETE), so all are routed.
A static credential authenticates the sender, not the body, and gives no
replay protection: use HTTPS and rotate the value if it leaks.
"""

import hmac
import json
import logging
import os
import re
from typing import Any, Dict, Mapping, Optional, Tuple
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("zoho-flow-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Zoho Flow Webhook Handler")

DEFAULT_HEADER = "X-Webhook-Secret"


def verify_zoho_flow_request(
    headers: Mapping[str, str],
    name: Optional[str] = None,
    secret: Optional[str] = None,
) -> bool:
    """Compare the whole header value with the secret in constant time.

    headers must be case-insensitive (Starlette's are).
    """
    name = name or os.environ.get("ZOHO_FLOW_WEBHOOK_HEADER") or DEFAULT_HEADER
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)
    if not received:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


def parse_payload(
    raw: str, content_type: str = "", query: Optional[Mapping[str, str]] = None
) -> Optional[Tuple[str, Any]]:
    """The body is whatever the action sends (Content-Type is "typically JSON").
    Returns (format, data), or None for a body labelled JSON that doesn't parse.
    With no body (GET, often DELETE) the query parameters are the payload."""
    ctype = content_type.lower()
    if raw.strip() == "":
        return ("query", dict(query or {}))
    if "application/x-www-form-urlencoded" in ctype:
        return ("form", dict(parse_qsl(raw, keep_blank_values=True)))
    looks_json = re.match(r"^\s*[{\[]", raw) is not None
    if "json" in ctype or looks_json:
        try:
            return ("json", json.loads(raw))
        except ValueError:
            return None if "json" in ctype else ("text", raw)
    return ("text", raw)


def handle_payload(method: str, fmt: str, data: Any) -> None:
    """Flow adds no event name. These examples assume an illustrative body with
    an `event` field you add on the action, e.g.
      {"event": "form.submitted", "name": "...", "email": "..."}
    """
    if fmt == "text" or not isinstance(data, dict):
        logger.info("Zoho Flow %s with a %s body", method, fmt)
        return
    event = data.get("event")
    if event == "form.submitted":
        logger.info("Form submitted by %s", data.get("email"))
    elif event == "deal.won":
        logger.info("Deal %s won", data.get("deal_id"))
    else:
        logger.info("Zoho Flow %s with event %s", method, event)


# The Send Webhook action's method is user-chosen.
@app.api_route("/webhooks/zoho-flow", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def zoho_flow_webhook(request: Request) -> Dict[str, Any]:
    secret = os.environ.get("ZOHO_FLOW_WEBHOOK_SECRET")
    if not secret:
        logger.error("ZOHO_FLOW_WEBHOOK_SECRET is not set: rejecting request")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Authenticate before reading or parsing the body.
    if not verify_zoho_flow_request(request.headers, secret=secret):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")

    raw = (await request.body()).decode("utf-8", errors="replace")
    parsed = parse_payload(raw, request.headers.get("content-type", ""), request.query_params)
    if parsed is None:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    handle_payload(request.method, *parsed)
    # With the action's Response Type set to JSON or Auto, these keys become variables.
    return {"received": True}


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
