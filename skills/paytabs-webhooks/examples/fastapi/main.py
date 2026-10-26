import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

HEX_DIGEST = re.compile(r"[0-9a-f]{64}", re.IGNORECASE | re.ASCII)


def verify_paytabs_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    """Verify the `Signature` header: hex(HMAC-SHA256(raw_body, profile ServerKey)).

    The header is the bare digest (no prefix). Only the body is signed.
    """
    if not header or not secret:
        return False
    # Check the format before comparing: exactly 64 hex characters
    if not HEX_DIGEST.fullmatch(header):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes, never str, so the comparison is constant time and cannot raise
    return hmac.compare_digest(header.lower().encode("ascii"), expected.encode("ascii"))


@app.post("/webhooks/paytabs")
async def paytabs_webhook(request: Request):
    # Raw body is required: the signature covers the exact bytes PayTabs sent
    raw_body = await request.body()

    signature = request.headers.get("signature")
    if not signature:
        raise HTTPException(status_code=401, detail="Missing signature header")
    if not verify_paytabs_signature(raw_body, signature, os.environ.get("PAYTABS_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification, and treat every field as untrusted
    try:
        transaction = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(transaction, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # There is no event name: every callback/IPN is the full transaction.
    # tran_type is the transaction type; payment_result.response_status is the outcome.
    tran_type = transaction.get("tran_type") if isinstance(transaction.get("tran_type"), str) else None
    tran_ref = transaction.get("tran_ref") if isinstance(transaction.get("tran_ref"), str) else None
    result = transaction.get("payment_result") if isinstance(transaction.get("payment_result"), dict) else {}
    status = result.get("response_status") if isinstance(result.get("response_status"), str) else None

    if status == "A":
        if tran_type == "Sale":
            print(f"Sale authorised: {tran_ref}")
        elif tran_type == "Refund":
            print(f"Refund authorised: {tran_ref}")
        else:
            print(f"Transaction authorised: {tran_type} {tran_ref}")
    else:
        print(f"Transaction not authorised: {tran_type} {tran_ref} {status} {result.get('response_message')}")

    # IPN fires on every create or change, so dedupe on tran_ref plus status
    return {"received": True}
