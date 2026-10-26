# Generated with: lumos-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes: compare_digest raises
    TypeError on a non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_lumos_request(headers, header_name=None, secret=None) -> bool:
    """Lumos requests are authenticated with a custom header you add to the webhook
    in Lumos. The header name is yours to choose (LUMOS_WEBHOOK_HEADER, default
    Authorization) and the WHOLE value is compared with LUMOS_WEBHOOK_SECRET.
    No "Bearer " prefix is stripped or parsed.

    NOTE: Lumos also signs requests (HMAC-SHA256 in X-Lumos-Webhook-Signature), but
    the header format is documented in a login-gated article, so it is NOT verified here.
    """
    header_name = header_name or os.environ.get("LUMOS_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("LUMOS_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_lumos_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_lumos_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Lumos webhook header")


def handle_webhook(payload: dict) -> None:
    # Lumos does not publish field names, so this payload shape is illustrative.
    user = payload.get("user")
    email = user.get("email") if isinstance(user, dict) else None
    permissions = payload.get("permissions")
    count = len(permissions) if isinstance(permissions, list) else 0
    print(f"Lumos webhook for {email or 'unknown user'}: {count} permission(s)")
    # TODO: grant or remove the listed permissions on your system, then return 200


@app.post("/webhooks/lumos", dependencies=[Depends(require_lumos_header)])
async def lumos_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_webhook(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Lumos webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
