# Generated with: sigfox-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises TypeError on
    non-ASCII str, but accepts bytes of any content."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_sigfox_request(headers, secret=None, name=None) -> bool:
    """Sigfox callbacks are not signed. You add a secret header to the callback's Headers;
    the header name is yours (SIGFOX_WEBHOOK_HEADER, default Authorization) and the
    expected value is the exact whole header value (SIGFOX_WEBHOOK_SECRET), including any
    "Bearer " prefix you typed. A static credential authenticates the sender, not the
    body, and gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("SIGFOX_WEBHOOK_SECRET", "")
    name = name or os.environ.get("SIGFOX_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_sigfox_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_sigfox_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credential header")


def classify_callback(p: dict) -> str:
    """The callback type isn't in the request, so infer it from the variables present."""
    if "severity" in p:
        return "error"
    if "infoCode" in p:
        return "service acknowledge"
    if "repeatedMsg" in p:
        return "service repeater"
    if "lqi" in p or "linkQuality" in p:
        return "data advanced"
    if "ack" in p or "longPolling" in p:
        return "data bidir"
    if "batt" in p or "temp" in p:
        return "service status"
    if "data" in p:
        return "data uplink"
    return "unknown"


def handle_callback(payload: dict) -> str:
    callback_type = classify_callback(payload)

    if callback_type == "data uplink":
        print(f"Uplink from {payload.get('device')}: {payload.get('data')} (seq {payload.get('seqNumber')})")
        # TODO: decode payload["data"] (hex) and store the reading

    elif callback_type == "data bidir":
        print(f"Bidir uplink from {payload.get('device')}, ack={payload.get('ack')}")
        # TODO: respond with downlink data if payload["ack"] is true

    elif callback_type == "data advanced":
        print(f"Advanced data from {payload.get('device')}, link quality {payload.get('lqi')}")
        # TODO: store link quality and duplicate metadata

    elif callback_type == "service status":
        print(f"Status from {payload.get('device')}: battery {payload.get('batt')} V, temp {payload.get('temp')}")
        # TODO: update device health

    elif callback_type == "service acknowledge":
        print(f"Downlink ack for {payload.get('device')}: code {payload.get('infoCode')}")
        # TODO: mark the downlink delivered or failed

    elif callback_type == "service repeater":
        print(f"Repeater {payload.get('device')}: {payload.get('repeatedMsg')} repeated messages")
        # TODO: record repeater stats

    elif callback_type == "error":
        print(f"Error for {payload.get('device')}: {payload.get('info')} ({payload.get('severity')})")
        # TODO: alert that the device missed its keep-alive

    else:
        print("Unhandled Sigfox callback")

    return callback_type


def parse_payload(request: Request, raw_body: bytes) -> dict:
    """Variables arrive in the query string (GET) and/or the body template (POST/PUT, JSON
    or form-encoded). Raises ValueError on a body that can't be parsed into an object."""
    body: dict = {}
    text = raw_body.decode("utf-8").strip()  # UnicodeDecodeError is a ValueError
    if text:
        content_type = request.headers.get("content-type", "").lower()
        if "application/x-www-form-urlencoded" in content_type:
            body = dict(parse_qsl(text, keep_blank_values=True))
        else:
            body = json.loads(text)  # JSONDecodeError is a ValueError
            if not isinstance(body, dict):
                raise ValueError("Expected an object")
    return {**dict(request.query_params), **body}


# The method is user-chosen in the Sigfox callback, so accept GET, POST and PUT.
@app.api_route(
    "/webhooks/sigfox",
    methods=["GET", "POST", "PUT"],
    dependencies=[Depends(require_sigfox_credential)],
)
async def sigfox_webhook(request: Request):
    # Read the raw body so any content type (and an empty body) is accepted.
    raw_body = await request.body()

    try:
        payload = parse_payload(request, raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid body")

    try:
        callback_type = handle_callback(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Sigfox callback: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "type": callback_type}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
