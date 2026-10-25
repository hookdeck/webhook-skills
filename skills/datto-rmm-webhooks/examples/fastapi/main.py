# Generated with: datto-rmm-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_datto_rmm_request(headers, header_name=None, secret=None) -> bool:
    """Datto RMM does not sign payloads. Authenticate with the secret header you added to
    the Global Webhook (Add Header). The name is user-chosen, so it comes from
    DATTO_RMM_WEBHOOK_HEADER; the WHOLE header value (including any "Bearer " prefix you
    typed) is compared with DATTO_RMM_WEBHOOK_SECRET. A static credential authenticates the
    sender, not the body, and gives no replay protection.
    """
    header_name = header_name or os.environ.get("DATTO_RMM_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("DATTO_RMM_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_datto_rmm_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_datto_rmm_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing secret header")


def parse_body(raw: bytes, content_type: str) -> dict:
    """The body is the user's template: JSON, text/plain or form-urlencoded. Never rejects."""
    text = raw.decode("utf-8", errors="replace")
    if "application/x-www-form-urlencoded" in content_type:
        return dict(parse_qsl(text, keep_blank_values=True))
    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value
    except json.JSONDecodeError:
        pass  # not JSON: fall through to plain text
    return {"text": text}


def handle_alert(payload: dict) -> None:
    # ILLUSTRATIVE: Datto RMM adds no event field. This assumes your alert raised / alert
    # resolved templates include a "status" field of "raised" or "resolved".
    status = payload.get("status")
    alert_uid = payload.get("alert_uid")
    message = payload.get("alert_message")

    if status == "raised":
        print(f"Alert raised {alert_uid}: {message}")
        # TODO: open a ticket or page on-call (payload["device_hostname"], payload["site_name"])

    elif status == "resolved":
        print(f"Alert resolved {alert_uid}: {message}")
        # TODO: close the matching ticket

    else:
        print("Unhandled Datto RMM payload (no recognised status field)")


@app.post("/webhooks/datto-rmm", dependencies=[Depends(require_datto_rmm_secret)])
async def datto_rmm_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()
    payload = parse_body(raw_body, request.headers.get("content-type", ""))

    try:
        handle_alert(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Datto RMM webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
