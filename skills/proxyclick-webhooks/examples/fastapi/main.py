# Generated with: proxyclick-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import json
import os
from typing import Optional, Tuple

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes: compare_digest raises
    TypeError on a non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def parse_basic_auth(header: Optional[str]) -> Optional[Tuple[str, str]]:
    """Parse `Authorization: Basic base64(username:password)`. The scheme is
    case-insensitive and the credentials split on the FIRST colon. Returns None
    for anything malformed."""
    if not header:
        return None
    scheme, _, encoded = header.partition(" ")
    if scheme.lower() != "basic":
        return None
    try:
        encoded = encoded.strip()
        encoded += "=" * (-len(encoded) % 4)  # accept unpadded base64, like the Node examples
        decoded = base64.b64decode(encoded, validate=True).decode("utf-8")
    except (binascii.Error, ValueError):
        return None
    username, sep, password = decoded.partition(":")
    if not sep:
        return None
    return username, password


def verify_proxyclick_request(headers, config=os.environ) -> bool:
    """Proxyclick does not sign payloads. The only security option is HTTP Basic auth,
    which must arrive on the FIRST request (no 401 + WWW-Authenticate challenge).
    Both comparisons run before the result is combined (no short-circuit)."""
    expected_user = config.get("PROXYCLICK_WEBHOOK_USERNAME")
    expected_pass = config.get("PROXYCLICK_WEBHOOK_PASSWORD")
    if not expected_user or not expected_pass:
        return False  # never accept when unconfigured

    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False

    user_ok = safe_equal(creds[0], expected_user)
    pass_ok = safe_equal(creds[1], expected_pass)
    return user_ok and pass_ok


async def require_proxyclick_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_proxyclick_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Basic credentials")


def handle_event(payload: dict) -> None:
    """ILLUSTRATIVE handler. No event-type field or payload attribute is documented in
    the pages this skill was written from, so nothing dispatches on a field. Check a
    real delivery before relying on any key."""
    print(f"Proxyclick webhook received (top-level keys: {', '.join(payload)})")
    # TODO: act on the visit or visitor data (check-in, check-out, visit created/updated/deleted)


@app.post("/webhooks/proxyclick", dependencies=[Depends(require_proxyclick_auth)])
async def proxyclick_webhook(request: Request):
    # Read the raw body so any content type works.
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
        print(f"Error handling Proxyclick webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
