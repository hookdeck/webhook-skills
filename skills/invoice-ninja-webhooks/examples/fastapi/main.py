# Generated with: invoice-ninja-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Invoice Ninja sends the webhook with the subscription's rest_method, which its server
# validates as post (the default) or put.
ALLOWED_METHODS = ["POST", "PUT"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises TypeError on
    non-ASCII str, and returns False (without raising) for bytes of different lengths."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_invoice_ninja_request(headers, secret: Optional[str] = None, header_name: Optional[str] = None) -> bool:
    """Invoice Ninja does not sign payloads. You add a secret header (key/value) to the
    webhook; the header name is yours, so it comes from configuration. The WHOLE value is
    compared, including any "Bearer " prefix you typed: nothing is stripped or parsed.
    The lookup is case-insensitive.
    """
    secret = secret if secret is not None else os.environ.get("INVOICE_NINJA_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("INVOICE_NINJA_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = {k.lower(): v for k, v in headers.items()}.get(header_name.lower())
    return bool(received) and safe_equal(received, secret)


async def require_invoice_ninja_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read or parsed.
    401, never 404/405/410: Invoice Ninja deletes the webhook subscription on those."""
    if not verify_invoice_ninja_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def detect_entity(payload: dict) -> str:
    """The body is the entity itself (transformer output) and has NO event field. The event
    key (create_invoice, ...) only names the subscription, so route by URL (add
    ?event=create_invoice to the target URL) or fall back to the entity's shape."""
    if isinstance(payload.get("line_items"), list):
        return "document"  # invoice, quote, credit, purchase order
    if "applied" in payload or "transaction_reference" in payload:
        return "payment"
    if isinstance(payload.get("contacts"), list):
        return "client"
    return "unknown"


def handle_entity(event: Optional[str], payload: dict) -> None:
    entity = None if event else detect_entity(payload)

    if event == "create_invoice":
        print(f"Invoice created: {payload.get('number')} ({payload.get('id')})")
        # TODO: sync the new invoice (payload["amount"], payload["client_id"], payload["line_items"])

    elif event == "create_payment":
        print(f"Payment created: {payload.get('number')} ({payload.get('id')})")
        # TODO: record the payment (payload["amount"], payload["client_id"], payload["invoices"])

    elif event == "update_client":
        print(f"Client updated: {payload.get('name')} ({payload.get('id')})")
        # TODO: refresh the client record (payload["contacts"])

    elif event:
        print(f"Unhandled event: {event}")

    elif entity == "document":
        print(f"Document received: {payload.get('number')} ({payload.get('id')})")

    elif entity == "payment":
        print(f"Payment received: {payload.get('number')} ({payload.get('id')})")

    elif entity == "client":
        print(f"Client received: {payload.get('name')} ({payload.get('id')})")

    else:
        print("Unrecognised entity shape")


@app.api_route(
    "/webhooks/invoice-ninja",
    methods=ALLOWED_METHODS,
    dependencies=[Depends(require_invoice_ninja_credential)],
)
async def invoice_ninja_webhook(request: Request):
    # Raw bytes, any content type. Invoice Ninja always sends a JSON body; an empty one is still acknowledged.
    raw = (await request.body()).decode("utf-8", errors="replace")
    payload: dict = {}
    if raw.strip():
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="Expected a JSON object")
        payload = parsed

    try:
        handle_entity(request.query_params.get("event"), payload)
    except Exception as exc:  # noqa: BLE001
        print(f"Error handling Invoice Ninja webhook: {exc}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
