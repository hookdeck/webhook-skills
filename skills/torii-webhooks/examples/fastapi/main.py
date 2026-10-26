# Generated with: torii-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The workflow author picks the HTTP method, so accept all the usual ones.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest rejects non-ASCII str)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_torii_request(headers, secret=None, header_name=None) -> bool:
    """Torii requests are unsigned. The workflow author adds a secret header to the
    custom action; the header name is user-chosen. Compare the WHOLE value (including
    any "Bearer " prefix) with TORII_WEBHOOK_SECRET. The header name is matched case-insensitively.
    """
    secret = secret if secret is not None else os.environ.get("TORII_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TORII_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    wanted = header_name.lower()
    received = next((v for k, v in headers.items() if k.lower() == wanted), None)
    return bool(received) and safe_equal(received, secret)


async def require_torii_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_torii_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credential header")


def handle_workflow_request(method: str, payload) -> None:
    # ILLUSTRATIVE ONLY: Torii adds no event field. The body is whatever JSON template
    # your workflow defines; "workflow" here is a field we made up for this example.
    body = payload if isinstance(payload, dict) else {}
    workflow = body.get("workflow")

    if workflow == "new app discovered":
        print(f"[{method}] New app discovered: {body.get('app')}")
        # TODO: open a review ticket for the app

    elif workflow == "user offboarding":
        print(f"[{method}] User offboarding: {body.get('user')}")
        # TODO: revoke access in downstream systems

    else:
        print(f"[{method}] Workflow request: {payload}")


@app.api_route("/webhooks/torii", methods=METHODS, dependencies=[Depends(require_torii_credential)])
async def torii_webhook(request: Request):
    # Read the raw body so any content type is accepted; an empty body is valid.
    raw_body = await request.body()

    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")

    try:
        handle_workflow_request(request.method, payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Torii request: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
