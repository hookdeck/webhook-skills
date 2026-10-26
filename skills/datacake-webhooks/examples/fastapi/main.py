# Generated with: datacake-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(received: str, expected: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str).

    Header values reach us decoded as latin-1, so encode them back to the original bytes;
    the configured secret is utf-8.
    """
    return hmac.compare_digest(
        received.encode("latin-1", errors="replace"),
        expected.encode("utf-8"),
    )


def verify_datacake_request(headers, header_name=None, secret=None) -> bool:
    """Datacake does not sign payloads. You add a secret header under Headers on the webhook
    (Authorization or any name you choose) and the receiver compares the WHOLE value, exactly
    as typed in Datacake, including any "Bearer " prefix. Nothing is stripped or parsed.
    Starlette's headers mapping is case-insensitive.
    """
    header_name = header_name or os.environ.get("DATACAKE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("DATACAKE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_datacake_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_datacake_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    data = payload.get("data")

    if event == "device_measurement":
        # data is a list of {field, value, device, timestamp} for the fields just recorded
        rows = data if isinstance(data, list) else []
        print(f"Device measurement: {len(rows)} value(s)")
        # TODO: store each row in your database (row["device"], row["field"], row["value"], row["timestamp"])

    elif event == "decoder_output":
        # data["result"] is the raw payload decoder output; data["log"] and data["device"] may be null
        data = data if isinstance(data, dict) else {}
        results = data.get("result") if isinstance(data.get("result"), list) else []
        print(f"Decoder output: {len(results)} result(s) for product {data.get('product')}")
        # TODO: act on raw decoder data that isn't stored in the time-series database

    elif event == "downlink":
        # data["meta"]["type"] is e.g. "lorawan"; data["payload"] is the base64 downlink payload
        data = data if isinstance(data, dict) else {}
        print(f"Downlink sent to device {data.get('device')}")
        # TODO: audit or mirror the downlink (data["meta"], data["payload"], data["product_slug"])

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/datacake", dependencies=[Depends(require_datacake_secret)])
async def datacake_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Datacake event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
