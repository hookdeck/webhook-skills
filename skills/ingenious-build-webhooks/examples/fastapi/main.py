# Generated with: ingenious-build-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_ingenious_build_request(headers, name=None, secret=None) -> bool:
    """INGENIOUS.BUILD does not sign payloads. You add an auth header (name of your choice, e.g.
    Authorization: Bearer <token>) to each webhook URL; we compare the WHOLE header value, with no
    'Bearer ' parsing. A static credential authenticates the sender, not the body, and gives no
    replay protection.
    """
    name = name or os.environ.get("INGENIOUS_BUILD_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("INGENIOUS_BUILD_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_auth_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_ingenious_build_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing auth header")


def handle_event(payload: dict) -> None:
    name = payload.get("name")
    subject = payload.get("subject")
    data = payload.get("data") or {}
    record_id = data.get("id") if isinstance(data, dict) else None

    if name == "budget_exported_to_accounting":
        print(f"Budget synced ({subject}): {record_id}")
        # TODO: create budget lines in the accounting system (data["items"])

    elif name == "budget_change_exported_to_accounting":
        print(f"Budget change synced ({subject}): {record_id}")
        # TODO: post the reallocation between cost codes (data["items"])

    elif name == "contract_exported_to_accounting":
        print(f"Contract synced ({subject}): {record_id}")
        # TODO: create the commitment (data["accounting_company_custom_id"], data["items"])

    elif name == "contract_change_exported_to_accounting":
        print(f"Contract change synced ({subject}): {record_id}")
        # TODO: amend the commitment

    elif name == "invoice_exported_to_accounting":
        invoice_number = data.get("invoice_number") if isinstance(data, dict) else None
        print(f"Invoice synced ({subject}): {invoice_number}")
        # TODO: create the vendor bill (data["gross_value"], data["items"])

    else:
        print(f"Unhandled event: {name}")


@app.post("/webhooks/ingenious-build", dependencies=[Depends(require_auth_header)])
async def ingenious_build_webhook(request: Request):
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
        print(f"Error handling INGENIOUS.BUILD event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
