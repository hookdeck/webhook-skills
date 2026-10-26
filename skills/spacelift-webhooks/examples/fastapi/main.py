# Generated with: spacelift-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

HEX64 = re.compile(r"[0-9a-fA-F]{64}")

# Latest stateVersion seen per run. Use a shared store in production.
last_version: dict = {}


def verify_spacelift_signature(raw_body: bytes, header, secret=None) -> bool:
    """Verify X-Signature-256: `sha256=<hex>` HMAC-SHA256 over the raw body bytes only.
    The prefix is optional. The key is the secret's UTF-8 bytes, used as-is."""
    secret = secret if secret is not None else os.environ.get("SPACELIFT_WEBHOOK_SECRET")
    if not secret or not isinstance(header, str):
        return False
    sig = re.sub(r"^sha256=", "", header.strip(), flags=re.IGNORECASE)
    if not HEX64.fullmatch(sig):  # validate before comparing
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # compare_digest on bytes (str raises on non-ASCII)
    return hmac.compare_digest(expected.encode(), sig.lower().encode())


def classify(payload) -> str:
    """Spacelift has no event-name field: tell the two documented payload shapes apart."""
    if not isinstance(payload, dict):
        return "unknown"
    if "state" in payload and "stateVersion" in payload and "run" in payload:
        return "run"
    if "title" in payload and "body" in payload:
        return "internal_error"
    return "unknown"


def handle_message(payload) -> str:
    kind = classify(payload)

    if kind == "run":
        run_id = _as_dict(payload.get("run")).get("id")
        version = payload.get("stateVersion")
        if not isinstance(run_id, (str, int)) or isinstance(version, bool) or not isinstance(version, int):
            print("Run event without a usable run.id / stateVersion; ignoring")
            return kind
        prev = last_version.get(run_id)
        # Updates can arrive out of order: ignore a stale stateVersion.
        if prev is not None and payload["stateVersion"] <= prev:
            print(f"Ignoring stale run update {run_id} v{payload['stateVersion']}")
        else:
            last_version[run_id] = payload["stateVersion"]
            stack_id = _as_dict(payload.get("stack")).get("id")
            print(f"Run {run_id} on stack {stack_id}: {payload['state']} (v{payload['stateVersion']})")
            # TODO: update your run tracking, notify a channel, etc.

    elif kind == "internal_error":
        print(f"Spacelift internal error ({payload.get('severity')}): {payload.get('title')}")
        # TODO: alert the team

    else:
        print("Unhandled Spacelift message")

    return kind


# Spacelift doesn't name the HTTP method, so accept all of them.
@app.api_route("/webhooks/spacelift", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def spacelift_webhook(request: Request):
    # Raw bytes, any content type. A missing body is zero bytes.
    raw_body = await request.body()

    if not verify_spacelift_signature(raw_body, request.headers.get("x-signature-256")):
        raise HTTPException(status_code=401, detail="Invalid or missing signature")

    payload = None
    if raw_body:
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")

    try:
        kind = handle_message(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Spacelift message: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "type": kind}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
