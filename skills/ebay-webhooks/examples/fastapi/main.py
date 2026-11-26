# Generated with: ebay-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import json
import os
import time

import httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

ONE_HOUR_SECONDS = 60 * 60

# Public key cache — keyed by `kid` from the x-ebay-signature header. eBay
# recommends caching ~1 hour. Exposed so tests can preload it and skip the live
# OAuth + getPublicKey call. Maps kid -> (pem, expires_epoch).
_key_cache: dict[str, tuple[str, float]] = {}


def load_config() -> dict:
    env = (os.environ.get("EBAY_ENV") or "production").lower()
    return {
        "client_id": os.environ.get("EBAY_CLIENT_ID"),
        "client_secret": os.environ.get("EBAY_CLIENT_SECRET"),
        "verification_token": os.environ.get("EBAY_VERIFICATION_TOKEN"),
        "endpoint": os.environ.get("EBAY_ENDPOINT"),
        "api_host": "api.sandbox.ebay.com" if env == "sandbox" else "api.ebay.com",
    }


def to_pem(key: str) -> str:
    """Wrap a bare Base64 SubjectPublicKeyInfo into a well-formed PEM."""
    if "BEGIN PUBLIC KEY" in key:
        return key.replace(
            "-----BEGIN PUBLIC KEY-----", "-----BEGIN PUBLIC KEY-----\n"
        ).replace("-----END PUBLIC KEY-----", "\n-----END PUBLIC KEY-----")
    return f"-----BEGIN PUBLIC KEY-----\n{key}\n-----END PUBLIC KEY-----"


def get_app_token(config: dict) -> str:
    """Application access token via OAuth client-credentials grant."""
    creds = base64.b64encode(
        f"{config['client_id']}:{config['client_secret']}".encode()
    ).decode()
    resp = httpx.post(
        f"https://{config['api_host']}/identity/v1/oauth2/token",
        headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data={
            "grant_type": "client_credentials",
            "scope": "https://api.ebay.com/oauth/api_scope",
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_public_key(kid: str, config: dict) -> str:
    """Fetch (and cache ~1h) the public key for a `kid` from eBay."""
    cached = _key_cache.get(kid)
    if cached is not None and cached[1] > time.time():
        return cached[0]

    token = get_app_token(config)
    resp = httpx.get(
        f"https://{config['api_host']}/commerce/notification/v1/public_key/{kid}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    resp.raise_for_status()
    pem = to_pem(resp.json()["key"])
    _key_cache[kid] = (pem, time.time() + ONE_HOUR_SECONDS)
    return pem


def verify_ebay_signature(raw_body: bytes, signature_header: str | None, config: dict) -> bool:
    """Verify the ECDSA x-ebay-signature over the RAW request body (SHA-1)."""
    if not signature_header:
        return False
    try:
        sig = json.loads(base64.b64decode(signature_header))
    except Exception:
        return False  # decoded JSON carries kid and signature

    kid = sig.get("kid")
    signature_b64 = sig.get("signature")
    if not kid or not signature_b64:
        return False

    try:
        pem = get_public_key(kid, config)
    except Exception:
        return False

    try:
        public_key = load_pem_public_key(pem.encode())
        public_key.verify(
            base64.b64decode(signature_b64),
            raw_body,  # body exactly as received
            ec.ECDSA(hashes.SHA1()),  # eBay signs ECDSA with SHA-1
        )
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


@app.get("/webhooks/ebay")
async def ebay_challenge(challenge_code: str | None = None):
    """Endpoint challenge validation.

    Respond 200 with { "challengeResponse": SHA-256(code + token + endpoint) }.
    """
    if not challenge_code:
        raise HTTPException(status_code=400, detail="Missing challenge_code")

    config = load_config()
    if not config["verification_token"] or not config["endpoint"]:
        raise HTTPException(status_code=500, detail="Server misconfigured")

    # ORDER IS MANDATORY: challengeCode + verificationToken + endpoint
    h = hashlib.sha256()
    h.update(challenge_code.encode())
    h.update(config["verification_token"].encode())
    h.update(config["endpoint"].encode())
    return JSONResponse(status_code=200, content={"challengeResponse": h.hexdigest()})


@app.post("/webhooks/ebay")
async def ebay_webhook(request: Request):
    config = load_config()
    raw_body = await request.body()
    signature_header = request.headers.get("x-ebay-signature")

    if not verify_ebay_signature(raw_body, signature_header, config):
        # 412 Precondition Failed matches eBay's SDK behaviour for a bad signature.
        raise HTTPException(status_code=412, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    topic = (event.get("metadata") or {}).get("topic")
    data = (event.get("notification") or {}).get("data") or {}

    if topic == "MARKETPLACE_ACCOUNT_DELETION":
        print(f"Account deletion for user: {data.get('userId')} {data.get('username')}")
        # Your code: delete or anonymize this user's data
    elif topic == "AUTHORIZATION_REVOCATION":
        print(f"Authorization revoked for user: {data.get('userId')} {data.get('username')}")
        # Your code: stop API calls for this user and purge stored OAuth tokens
    elif topic == "ITEM_AVAILABILITY":
        print(f"Item availability changed: {data.get('itemId')}")
    elif topic == "ITEM_PRICE_REVISION":
        print(f"Item price revised: {data.get('itemId')}")
    elif topic == "PRIORITY_LISTING_REVISION":
        print(f"Priority listing revised: {data.get('listingId')}")
    else:
        print(f"Unhandled topic: {topic}")

    # 204 No Content acknowledges the notification (eBay wants a 2xx).
    return Response(status_code=204)


@app.get("/health")
async def health():
    return {"status": "ok"}
