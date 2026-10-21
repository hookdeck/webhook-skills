import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()

# In-memory de-duplication by Solana transaction signature.
# Use a durable store (Redis, database) in production.
seen_signatures: set = set()


def verify_helius_auth(received: Optional[str], expected: Optional[str]) -> bool:
    """Helius does not sign webhooks. The authHeader configured on the webhook is
    sent verbatim as the Authorization header, so compare the whole value.
    Hashing both sides keeps the constant-time comparison length-independent."""
    if not received or not expected:
        return False
    return hmac.compare_digest(
        hashlib.sha256(received.encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    )


async def require_helius_auth(authorization: Optional[str] = Header(None)) -> None:
    expected = os.getenv("HELIUS_AUTH_HEADER")
    if not expected:
        raise HTTPException(status_code=500, detail="HELIUS_AUTH_HEADER is not configured")
    if not verify_helius_auth(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def handle_transaction(tx: dict) -> None:
    # Enhanced webhooks set "type"; raw webhooks do not.
    tx_type = tx.get("type")
    if tx_type == "NFT_SALE":
        print(f"NFT sale: {tx.get('description')}")
        # TODO: record the sale, notify subscribers
    elif tx_type == "SWAP":
        print(f"Swap: {tx.get('description')}")
        # TODO: update positions, trigger trading logic
    elif tx_type == "TRANSFER":
        print(f"Transfer: {tx.get('description')}")
        # TODO: credit deposits, update balances
    else:
        print(f"Unhandled transaction type: {tx_type or 'RAW'} {tx.get('signature')}")


@app.post("/webhooks/helius", dependencies=[Depends(require_helius_auth)])
async def helius_webhook(request: Request):
    # Parse only after the Authorization header has been checked
    try:
        payload = json.loads(await request.body())
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Helius delivers an array of transactions
    transactions = payload if isinstance(payload, list) else [payload]

    for tx in transactions:
        if not isinstance(tx, dict):
            continue
        # Retries can redeliver the same transaction
        signature = tx.get("signature")
        if signature:
            if signature in seen_signatures:
                continue
            seen_signatures.add(signature)
        handle_transaction(tx)

    # Acknowledge quickly; Helius expects a 200 within 1 second
    return {"status": "OK"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
