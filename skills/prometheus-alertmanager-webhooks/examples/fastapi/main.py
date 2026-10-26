# Generated with: prometheus-alertmanager-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

BEARER = re.compile(r"^bearer ", re.IGNORECASE)  # auth schemes are case-insensitive (RFC 9110)
BASIC = re.compile(r"basic +([A-Za-z0-9+/]+={0,2})", re.IGNORECASE)

# In-memory dedupe for the example; use a shared store (Redis, DB) in production.
seen: set = set()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison (compare_digest on equal-length digests of the bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def parse_basic(header: str):
    """Decode `Basic base64(username:password)`; None unless canonical base64 with a colon."""
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


def verify_alertmanager_request(headers, secret=None, username=None, password=None) -> bool:
    """Alertmanager does not sign payloads. The receiver's http_config sets the Authorization
    header on every request, in one of two forms (Hookdeck's source offers both):
    - authorization (default type Bearer): `Authorization: Bearer <credentials>`. The secret is
      stored bare in ALERTMANAGER_WEBHOOK_SECRET; a leading "Bearer " in it is stripped.
    - basic_auth: `Authorization: Basic base64(username:password)`, checked against
      ALERTMANAGER_WEBHOOK_USERNAME and ALERTMANAGER_WEBHOOK_PASSWORD.
    A form that isn't configured is rejected, so with neither configured everything is rejected.
    """
    secret = secret if secret is not None else os.environ.get("ALERTMANAGER_WEBHOOK_SECRET")
    username = username if username is not None else os.environ.get("ALERTMANAGER_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("ALERTMANAGER_WEBHOOK_PASSWORD")
    header = headers.get("authorization")
    if not header:
        return False

    if BEARER.match(header):
        if not secret:
            return False  # Bearer not configured
        expected = BEARER.sub("", secret, count=1)
        if not expected:
            return False  # a configured value of just "Bearer " must not match
        return safe_equal(BEARER.sub("", header, count=1), expected)

    if re.match(r"basic ", header, re.IGNORECASE):
        if not username or not password:
            return False  # basic_auth not configured
        creds = parse_basic(header)
        if creds is None:
            return False
        user_ok = safe_equal(creds[0], username)
        pass_ok = safe_equal(creds[1], password)  # evaluate both, no short-circuit
        return user_ok and pass_ok

    return False


async def require_alertmanager_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_alertmanager_request(request.headers):
        raise HTTPException(
            status_code=401, detail="Invalid or missing Authorization credentials"
        )


def alert_key(group_key, alert: dict) -> str:
    return "|".join(
        str(x)
        for x in (
            group_key,
            alert.get("fingerprint"),
            alert.get("status"),
            alert.get("startsAt"),
            alert.get("endsAt"),
        )
    )


def handle_alert(alert: dict, group: dict) -> None:
    name = (alert.get("labels") or {}).get("alertname", "unknown")
    status = alert.get("status")

    if status == "firing":
        print(f"Alert firing: {name} ({alert.get('fingerprint')}) on receiver {group.get('receiver')}")
        # TODO: page on-call or open an incident (alert["labels"], alert["annotations"])

    elif status == "resolved":
        print(f"Alert resolved: {name} ({alert.get('fingerprint')})")
        # TODO: close the matching incident

    else:
        print(f"Unhandled alert status: {status}")


def handle_group(payload: dict) -> None:
    # status is a state, not an event type: loop over alerts[] and use each alert's own status.
    if (payload.get("truncatedAlerts") or 0) > 0:
        print(f"{payload['truncatedAlerts']} alerts were truncated by max_alerts")
    for alert in payload.get("alerts") or []:
        key = alert_key(payload.get("groupKey"), alert)
        if key in seen:
            continue  # repeat notification (group_interval / repeat_interval)
        seen.add(key)
        handle_alert(alert, payload)


@app.post(
    "/webhooks/prometheus-alertmanager",
    dependencies=[Depends(require_alertmanager_auth)],
)
async def alertmanager_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")
    alerts = payload.get("alerts")
    if alerts is not None and not isinstance(alerts, list):
        raise HTTPException(status_code=400, detail="Expected alerts to be an array")

    try:
        handle_group(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Alertmanager notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
