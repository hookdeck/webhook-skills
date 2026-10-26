# Generated with: payrix-pro-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import logging
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()
logger = logging.getLogger("payrix_pro")


def verify_payrix_pro_request(headers, secret=None, header_name=None) -> bool:
    """
    Payrix Pro does not sign requests. It sends whatever Header Name / Header Value you
    set on the webhook action. Compare the WHOLE header value with the expected value:
    no prefix is stripped or parsed ("Bearer ..." is just part of the value).
    """
    secret = secret if secret is not None else os.environ.get("PAYRIX_PRO_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PAYRIX_PRO_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Compare bytes: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


def parse_body(raw: bytes, content_type: str = ""):
    """Parse JSON when the content type says so; otherwise keep the raw text.

    Returns (payload, error).
    """
    if not raw:
        return None, None
    text = raw.decode("utf-8", errors="replace")
    if re.search(r"json", content_type or "", re.IGNORECASE):
        try:
            return json.loads(text), None
        except ValueError:
            return None, "Invalid JSON body"
    return text, None


def handle_alert(payload) -> None:
    # The payload shape isn't documented; this is an illustrative transaction alert:
    # {"alert": "transaction", "transaction": {"id": "t1_txn_...", "total": 1500}}
    if isinstance(payload, (dict, list)):
        logger.info("Payrix Pro alert (JSON): %s", json.dumps(payload)[:200])
    elif payload:
        logger.info("Payrix Pro alert (raw text): %s", str(payload)[:200])
    else:
        logger.info("Payrix Pro alert (empty body)")
    # TODO: dispatch on the fields your alert actually sends


# Payrix doesn't document the HTTP method, so accept all of them.
@app.api_route(
    "/webhooks/payrix-pro",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
)
async def payrix_pro_webhook(request: Request):
    # Authenticate before reading or parsing the body.
    if not verify_payrix_pro_request(request.headers):
        return JSONResponse({"error": "Invalid or missing webhook header"}, status_code=401)

    raw = await request.body()  # any content type; may be empty
    payload, error = parse_body(raw, request.headers.get("content-type", ""))
    if error:
        return JSONResponse({"error": error}, status_code=400)

    try:
        handle_alert(payload)
    except Exception:
        logger.exception("Error handling Payrix Pro alert")
        return JSONResponse({"error": "Handler error"}, status_code=500)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
