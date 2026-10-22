import os
import hmac
import hashlib
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_seatable_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a SeaTable webhook signature.

    Header: X-Seatable-Signature: sha256=<hex HMAC-SHA256 of the raw body>
    The secret is used as a UTF-8 string key.
    """
    if not signature_header or not secret:
        return False

    received = signature_header.removeprefix("sha256=").lower()
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(received, expected)


@app.post("/webhooks/seatable")
async def seatable_webhook(request: Request):
    secret = os.environ.get("SEATABLE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes for any content type, so the signature always verifies
    raw_body = await request.body()
    signature_header = request.headers.get("x-seatable-signature")

    if not verify_seatable_webhook(raw_body, signature_header, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # `event` is currently always "update"; `data.op_type` says what changed
    data = payload.get("data") or {}
    op_type = data.get("op_type")
    row_count = f" ({data['row_count']} rows)" if data.get("row_count") else ""

    if op_type in ("insert_row", "create_row"):
        print(f"Row created in {data.get('table_name')}{row_count}: {data.get('row_id')}")
        # TODO: Sync the new row, notify, enrich, etc.

    elif op_type == "modify_row":
        print(f"Row modified in {data.get('table_name')}{row_count}: {data.get('row_id')}")
        for change in data.get("row_data") or []:
            print(f"  {change.get('column_name')}: {change.get('old_value')!r} -> {change.get('value')!r}")
        # TODO: React to column changes

    elif op_type == "delete_row":
        print(f"Row deleted in {data.get('table_name')}{row_count}: {data.get('row_id')}")
        # TODO: Remove from downstream systems

    else:
        print(f"Unhandled {payload.get('event')} op_type: {op_type}")

    # SeaTable disables the webhook after 5 consecutive non-200 responses
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
