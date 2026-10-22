# Generated with: aws-eventbridge-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# The API destination method is configurable, so accept all of these.
ALLOWED_METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]

_BASIC_RE = re.compile(r"^basic +([A-Za-z0-9+/]+={0,2})$", re.IGNORECASE)


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison: compare_digest on equal-length bytes digests (never str,
    which raises on non-ASCII)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def parse_basic_auth(header):
    """Parse "Authorization: Basic base64(username:password)". The scheme is
    case-insensitive and the value is split on the FIRST colon. Returns None if malformed."""
    if not isinstance(header, str):
        return None
    match = _BASIC_RE.match(header.strip())
    if not match:
        return None
    try:
        decoded = base64.b64decode(match.group(1), validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError):
        return None
    username, sep, password = decoded.partition(":")
    if not sep:
        return None
    return username, password


def verify_aws_eventbridge_request(headers, username=None, password=None) -> bool:
    """EventBridge does not sign API destination requests. With a Basic-auth Connection it
    populates the Authorization header, which authenticates the sender (not the body).
    """
    username = username if username is not None else os.environ.get("AWS_EVENTBRIDGE_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("AWS_EVENTBRIDGE_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured
    creds = parse_basic_auth(headers.get("authorization"))
    if creds is None:
        return False
    # Evaluate both comparisons before deciding (no short-circuit).
    user_ok = safe_equal(creds[0], username)
    pass_ok = safe_equal(creds[1], password)
    return user_ok and pass_ok


async def require_basic_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read or parsed."""
    if not verify_aws_eventbridge_request(request.headers):
        raise HTTPException(
            status_code=401,
            detail="Invalid or missing Basic credentials",
            headers={"WWW-Authenticate": 'Basic realm="aws-eventbridge"'},
        )


def handle_event(event: dict) -> None:
    source = event.get("source")
    detail_type = event.get("detail-type")
    detail = event.get("detail") or {}

    if source == "aws.ec2" and detail_type == "EC2 Instance State-change Notification":
        print(f"EC2 instance {detail.get('instance-id')} is now {detail.get('state')}")
        # TODO: react to the instance state change (detail["instance-id"], detail["state"])

    elif source == "aws.s3" and detail_type == "Object Created":
        bucket = (detail.get("bucket") or {}).get("name")
        key = (detail.get("object") or {}).get("key")
        print(f"S3 object created: {bucket}/{key}")
        # TODO: process the new object (detail["bucket"]["name"], detail["object"]["key"])

    elif source == "com.example.orders" and detail_type == "OrderCreated":
        print(f"Order created: {detail.get('orderId')}")
        # TODO: fulfil the order (your own source and detail-type go here)

    else:
        print(f"Unhandled event: {source} / {detail_type}")


@app.api_route(
    "/webhooks/aws-eventbridge",
    methods=ALLOWED_METHODS,
    dependencies=[Depends(require_basic_auth)],
)
async def aws_eventbridge_webhook(request: Request):
    # Read the raw body so any content type is accepted; GET and DELETE usually have none.
    raw_body = await request.body()
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        payload = None

    try:
        if isinstance(payload, dict) and "detail-type" in payload:
            handle_event(payload)  # default event envelope
        else:
            # An input transformer builds the body, so its shape is whatever your template says.
            print("Received a transformed (non-envelope) payload")
    except Exception as err:  # noqa: BLE001
        print(f"Error handling EventBridge event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
