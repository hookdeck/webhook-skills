# Generated with: kibana-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

# The Kibana Webhook connector can use POST (default), PUT, PATCH, GET or DELETE.
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

# Scheme is case-insensitive; the credential must use the strict base64 alphabet.
BASIC_HEADER = re.compile(r"basic\s+([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def verify_basic_auth(auth_header: str | None) -> bool:
    """Kibana does not sign webhooks. With Basic authentication selected on the connector it
    sends `Authorization: Basic base64(username:password)` on every request. Hookdeck never
    sends a 401 challenge, so the header must be present on each request."""
    username = os.environ.get("KIBANA_WEBHOOK_USERNAME", "").encode()
    password = os.environ.get("KIBANA_WEBHOOK_PASSWORD", "").encode()
    if not username or not password:
        return False  # never accept when unconfigured
    m = BASIC_HEADER.fullmatch(auth_header or "")
    if not m:
        return False
    try:
        # validate=True rejects anything outside the base64 alphabet or with bad padding
        decoded = base64.b64decode(m.group(1), validate=True)
    except ValueError:
        return False
    user, sep, pw = decoded.partition(b":")  # split on the first colon; password may contain ':'
    if not sep:
        return False
    # Evaluate both comparisons before deciding (no short-circuit).
    user_ok = safe_equal(user, username)
    pass_ok = safe_equal(pw, password)
    return user_ok and pass_ok


@app.api_route("/webhooks/kibana", methods=ALLOWED_METHODS)
async def kibana_webhook(request: Request):
    # 1. Authenticate first, for every method
    if not verify_basic_auth(request.headers.get("authorization")):
        print("Kibana webhook authentication failed")
        return Response(content="Unauthorized", status_code=401)

    # 2. The body may be empty (GET, DELETE). Parse JSON when it parses, otherwise keep the text.
    raw = await request.body()
    text = raw.decode("utf-8", errors="replace")
    payload = text
    if text:
        try:
            payload = json.loads(text)
        except ValueError:
            payload = text

    # 3. Handle the rule action. The body is whatever your connector's mustache template renders.
    # ILLUSTRATIVE payload (not a vendor schema):
    #   {"rule": "{{rule.name}}", "status": "{{alert.actionGroup}}", "context": "{{context.message}}"}
    if isinstance(payload, dict):
        if str(payload.get("status")).lower() == "recovered":
            print(f"Rule recovered: {payload.get('rule')}")
            # TODO: resolve the incident, notify the channel
        else:
            print(f"Rule action fired: {payload.get('rule')} ({payload.get('status')}): {payload.get('context')}")
            # TODO: open an incident, page on-call
    else:
        print(f"Received {request.method} with {'non-JSON' if text else 'empty'} body")

    # 4. Acknowledge quickly with any 2XX
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
