# Generated with: zoho-crm-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Zoho CRM webhook receiver for FastAPI.

Zoho CRM workflow webhooks are NOT signed. Add a Custom Parameter under the
webhook's Header (Setup > Automation > Actions > Webhooks), for example
X-Webhook-Secret: <long random value>, and compare it here.
CRM only sends headers on POST and PUT, so the route accepts those two.
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

logger = logging.getLogger("zoho-crm-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Zoho CRM Webhook Handler")

DEFAULT_HEADER = "X-Webhook-Secret"


def verify_zoho_crm_request(
    headers: Mapping[str, str],
    name: Optional[str] = None,
    secret: Optional[str] = None,
) -> bool:
    """Compare the whole header value with the secret in constant time.

    headers must be case-insensitive (Starlette's are).
    """
    name = name or os.environ.get("ZOHO_CRM_WEBHOOK_HEADER") or DEFAULT_HEADER
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)
    if not received:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


def parse_body(raw: str, content_type: str = "") -> Optional[Tuple[str, Any]]:
    """The body is whatever you configured: Form-Data parameters or a Raw
    Text/JSON/HTML/XML template. Returns (format, data), or None for a body
    labelled JSON that doesn't parse."""
    ctype = content_type.lower()
    if raw.strip() == "":
        return ("empty", None)
    if "application/x-www-form-urlencoded" in ctype:
        return ("form", dict(parse_qsl(raw, keep_blank_values=True)))
    looks_json = re.match(r"^\s*[{\[]", raw) is not None
    if "json" in ctype or looks_json:
        try:
            return ("json", json.loads(raw))
        except ValueError:
            return None if "json" in ctype else ("text", raw)
    return ("text", raw)


def handle_notification(fmt: str, data: Any) -> None:
    """Zoho adds no event name or record ID. These examples assume an
    illustrative raw JSON template (or form-data parameters) with a module and an id:
      {"module": "Leads", "id": "${Leads.Lead Id}", "email": "${Leads.Email}"}
    """
    if fmt not in ("json", "form") or not isinstance(data, dict):
        logger.info("Zoho CRM webhook with a %s body", fmt)
        return
    module = data.get("module")
    if module == "Leads":
        logger.info("Lead %s changed (%s)", data.get("id"), data.get("email") or "no email")
    elif module == "Contacts":
        logger.info("Contact %s changed", data.get("id"))
    elif module == "Deals":
        logger.info("Deal %s changed (stage: %s)", data.get("id"), data.get("stage"))
    else:
        logger.info("Zoho CRM webhook for module %s", module)


# CRM only sends headers on POST and PUT, so only those methods are routed.
@app.api_route("/webhooks/zoho-crm", methods=["POST", "PUT"])
async def zoho_crm_webhook(request: Request) -> Dict[str, Any]:
    secret = os.environ.get("ZOHO_CRM_WEBHOOK_SECRET")
    if not secret:
        logger.error("ZOHO_CRM_WEBHOOK_SECRET is not set: rejecting request")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Authenticate before reading or parsing the body.
    if not verify_zoho_crm_request(request.headers, secret=secret):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")

    raw = (await request.body()).decode("utf-8", errors="replace")
    parsed = parse_body(raw, request.headers.get("content-type", ""))
    if parsed is None:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Respond within 10 seconds: Zoho treats a slower response as a socket timeout.
    handle_notification(*parsed)
    return {"received": True}


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
