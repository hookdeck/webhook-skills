# Generated with: better-stack-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

PATH = "/webhooks/better-stack"
# The webhook's http_method can be get, post, put, patch, head or options (default post).
METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "OPTIONS"]
DEFAULT_HEADER = "X-Better-Stack-Secret"

BASIC = re.compile(r"basic +([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)  # schemes are case-insensitive


def safe_equal(a: bytes, b: bytes) -> bool:
    """Constant-time comparison (compare_digest on equal-length digests of the bytes)."""
    return hmac.compare_digest(hashlib.sha256(a).digest(), hashlib.sha256(b).digest())


def parse_basic(header: Optional[str]):
    """Decode `Basic base64(username:password)`; None unless canonical base64 with a colon."""
    if not header:
        return None
    m = BASIC.fullmatch(header)
    if not m or len(m.group(1)) % 4:
        return None
    token = m.group(1)
    try:
        raw = base64.b64decode(token, validate=True)
        decoded = raw.decode("utf-8")
    except ValueError:  # binascii.Error, UnicodeDecodeError
        return None
    if base64.b64encode(raw).decode("ascii") != token:
        return None  # reject junk after valid base64 (b64decode ignores stray padding)
    if ":" not in decoded:
        return None
    username, _, password = decoded.partition(":")  # FIRST colon: a password may contain ':'
    return username, password


def verify_better_stack_request(headers, env=None) -> bool:
    """Better Stack does not sign webhooks. A webhook can carry two kinds of static credential,
    and Hookdeck's Better Stack source offers both. A request passes if EITHER configured method
    matches; a method that isn't configured is never used, so with neither configured every
    request is rejected.
    - Basic auth (auth_username / auth_password): BETTER_STACK_WEBHOOK_USERNAME and
      BETTER_STACK_WEBHOOK_PASSWORD.
    - Custom header (headers_template): the header named by BETTER_STACK_WEBHOOK_HEADER
      (default X-Better-Stack-Secret) must equal BETTER_STACK_WEBHOOK_SECRET exactly.
    """
    env = os.environ if env is None else env

    # Custom header: whole value, verbatim (no prefix stripping, no trimming).
    header_ok = False
    secret = env.get("BETTER_STACK_WEBHOOK_SECRET")
    if secret:
        value = headers.get(env.get("BETTER_STACK_WEBHOOK_HEADER") or DEFAULT_HEADER)  # case-insensitive
        # Starlette decodes header bytes as latin-1; compare against the secret's UTF-8 bytes.
        header_ok = value is not None and safe_equal(value.encode("latin-1"), secret.encode("utf-8"))

    # Basic auth: evaluate username and password both, no short-circuit.
    basic_ok = False
    username = env.get("BETTER_STACK_WEBHOOK_USERNAME")
    password = env.get("BETTER_STACK_WEBHOOK_PASSWORD")
    if username and password:
        creds = parse_basic(headers.get("authorization"))
        if creds is not None:
            user_ok = safe_equal(creds[0].encode("utf-8"), username.encode("utf-8"))
            pass_ok = safe_equal(creds[1].encode("utf-8"), password.encode("utf-8"))
            basic_ok = user_ok and pass_ok

    return header_ok or basic_ok


async def require_better_stack_auth(request: Request) -> None:
    """FastAPI dependency: reject the request, for every method, before the body is read."""
    if not verify_better_stack_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def _is_set(v: Any) -> bool:
    # Default templates render unset timestamps as null or an empty string.
    return isinstance(v, str) and v.strip() != ""


def _text(v: Any) -> Optional[str]:
    if isinstance(v, bool):
        return None
    return str(v) if isinstance(v, (str, int, float)) else None


def _obj(v: Any) -> dict:
    return v if isinstance(v, dict) else {}


def _strings(v: Any) -> list:
    return [x for x in v if isinstance(x, str)] if isinstance(v, list) else []


def classify_better_stack_payload(payload: Any) -> dict:
    """Work out what a delivery is from its shape. Only the top-level `event: "comment"` is a
    documented wire value; every other state is inferred from attributes. A customised
    body_template may carry none of these fields, in which case the kind is 'unknown'.
    Every field is untrusted: wrong-typed values are ignored, never raised on.
    """
    root = _obj(payload)
    data = _obj(root.get("data"))
    attrs = _obj(data.get("attributes"))

    if data.get("type") == "incident":
        base = {"kind": "incident", "id": _text(data.get("id")), "name": _text(attrs.get("name"))}
        if root.get("event") == "comment":
            c = _obj(_obj(root.get("comment")).get("attributes"))
            return {
                **base,
                "state": "comment",
                "content": _text(c.get("content")),
                "author": _text(c.get("user_email")),
            }
        # Inference: resolved_at set -> resolved, acknowledged_at set -> acknowledged, else started/open.
        if _is_set(attrs.get("resolved_at")):
            state = "resolved"
        elif _is_set(attrs.get("acknowledged_at")):
            state = "acknowledged"
        else:
            state = "started"
        return {**base, "state": state, "cause": _text(attrs.get("cause"))}

    if data.get("type") == "monitor":
        # Created, updated, unpaused and deleted look alike; only paused_at distinguishes one.
        return {
            "kind": "monitor",
            "id": _text(data.get("id")),
            "name": _text(attrs.get("pronounceable_name")),
            "state": "paused" if _is_set(attrs.get("paused_at")) else "changed",
        }

    if data.get("change") in ("on_call", "holiday"):
        return {
            "kind": "on_call",
            "change": data["change"],
            "calendar": _text(data.get("calendar_name")),
            "emails": _strings(data.get("emails")),
            "on_holiday_emails": _strings(data.get("on_holiday_emails")),
        }

    return {"kind": "unknown"}


def handle_event(event: dict) -> None:
    kind = event["kind"]
    if kind == "incident":
        if event["state"] == "comment":
            print(f"Incident {event['id']} comment by {event['author']}: {event['content']}")
            # TODO: mirror the comment into your ticketing system
        else:
            print(f"Incident {event['id']} {event['state']}: {event['name']} ({event['cause']})")
            # TODO: open, update or close the matching incident on your side
    elif kind == "monitor":
        print(f"Monitor {event['id']} {event['state']}: {event['name']}")
        # TODO: sync monitor configuration
    elif kind == "on_call":
        print(f"On-call {event['change']} change on {event['calendar']}: {', '.join(event['emails'])}")
        # TODO: update who is on call in your tools
    else:
        print("Unrecognised Better Stack payload (customised body_template?)")


@app.api_route(PATH, methods=METHODS, dependencies=[Depends(require_better_stack_auth)])
async def better_stack_webhook(request: Request):
    # Read the raw body so any content type is accepted; GET, HEAD and OPTIONS have no body.
    raw_body = await request.body()
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
        # body_template is user-editable, so a non-JSON body is acknowledged and logged.
        print("Received a non-JSON body:", raw_body[:200])
        return {"received": True}

    try:
        handle_event(classify_better_stack_payload(payload))
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Better Stack webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
