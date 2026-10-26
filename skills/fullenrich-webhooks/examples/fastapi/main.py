import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SHA1_HEX = re.compile(r"^[0-9a-fA-F]{40}$")


def verify_fullenrich_signature(
    raw_body: bytes, signature: Optional[str], api_key: Optional[str]
) -> bool:
    """Verify a FullEnrich webhook signature.

    FullEnrich sends X-Signature-SHA1 = lowercase hex(HMAC-SHA1(api_key, raw_body)).
    The key is your FullEnrich API key; there is no separate webhook secret.
    """
    if not signature or not api_key or not SHA1_HEX.match(signature):
        return False

    expected = hmac.new(api_key.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()
    # Encode both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def handle_enrichment(payload: dict) -> None:
    """FullEnrich has no event types: `status` is the job state."""
    status = payload.get("status")

    if status == "FINISHED":
        credits = (payload.get("cost") or {}).get("credits", 0)
        print(f"Enrichment {payload.get('id')} finished ({credits} credits)")
        # TODO: Store data[].contact_info, match rows via data[].custom
    elif status == "IN_PROGRESS":
        # Sent per contact by webhook_events.contact_finished
        print(f"Contact finished in enrichment {payload.get('id')}")
        # TODO: Process data[0] as it completes
    elif status == "CANCELED":
        print(f"Enrichment {payload.get('id')} was canceled")
    elif status == "CREDITS_INSUFFICIENT":
        print(f"Enrichment {payload.get('id')} stopped: insufficient credits")
        # TODO: Alert and top up credits
    else:
        print(f"Unhandled enrichment status: {status}")


@app.post("/webhooks/fullenrich")
async def fullenrich_webhook(request: Request):
    api_key = os.getenv("FULLENRICH_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="API key not configured")

    signature = request.headers.get("x-signature-sha1")
    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Signature-SHA1 header")

    # Raw body for signature verification - don't use request.json() first
    raw_body = await request.body()
    if not verify_fullenrich_signature(raw_body, signature, api_key):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # FullEnrich retries non-2xx every minute (up to 5 times): keep this idempotent
    handle_enrichment(payload)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
