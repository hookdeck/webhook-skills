# Generated with: estuary-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Triggers default to POST and can use PUT or PATCH; GET and DELETE are accepted too.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def safe_equal(received: str, expected: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises TypeError for non-ASCII str).
    Header strings are Latin-1 decoded wire bytes; the secret is whatever you typed (UTF-8)."""
    return hmac.compare_digest(received.encode("latin-1"), expected.encode("utf-8"))


def verify_estuary_request(headers, config=os.environ) -> bool:
    """Estuary does not sign requests. You add a secret header to the materialization
    trigger (or the HTTP Webhook connector's custom headers). The header name is yours,
    so it comes from ESTUARY_WEBHOOK_HEADER (default Authorization). The WHOLE value is
    compared with ESTUARY_WEBHOOK_SECRET: a "Bearer " prefix is not stripped or parsed.
    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    expected = config.get("ESTUARY_WEBHOOK_SECRET")
    if not expected:
        return False  # never accept when unconfigured
    name = config.get("ESTUARY_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    return safe_equal(received, expected)


def classify(payload):
    """There is no vendor event field. A trigger body is the author's payloadTemplate
    (which may include materialization_name); the HTTP Webhook connector sends documents."""
    if payload is None:
        return "empty"
    if isinstance(payload, dict) and "materialization_name" in payload:
        return "trigger"
    return "document"


async def require_estuary_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read, for every method."""
    if not verify_estuary_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credential header")


def handle_event(payload) -> None:
    kind = classify(payload)

    if kind == "trigger":
        print(f"Estuary trigger: {payload.get('materialization_name')} (run {payload.get('run_id')})")
        # TODO: react to the committed transaction (e.g. start a downstream job)

    elif kind == "document":
        print("Estuary document received")
        # TODO: store or process the document

    else:
        print("Estuary request with an empty body")


@app.api_route("/webhooks/estuary", methods=METHODS, dependencies=[Depends(require_estuary_auth)])
async def estuary_webhook(request: Request):
    # Raw body so any content type works; GET and DELETE give empty bytes.
    raw_body = await request.body()

    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = {"raw": raw_body.decode("utf-8", errors="replace")}  # payloadTemplate may not be JSON

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Estuary webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
