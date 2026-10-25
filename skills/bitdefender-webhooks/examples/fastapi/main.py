# Generated with: bitdefender-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises TypeError
    on non-ASCII str, but accepts any bytes."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_bitdefender_request(headers, config=os.environ) -> bool:
    """GravityZone does not sign payloads. The credential is the Authorization header,
    sent verbatim from serviceSettings.authorization (e.g. "Bearer sfasdfw34243").
    Compare the WHOLE header value, including any "Bearer " / "Basic " prefix.
    Do not strip or decode it.
    """
    expected = config.get("BITDEFENDER_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_bitdefender_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_bitdefender_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(event: dict) -> None:
    # Each event carries a `module` identifier (the event type).
    module = event.get("module")

    if module == "av":
        print(f"Antimalware: {event.get('malware_name')} on {event.get('computer_name')} ({event.get('final_status')})")
        # TODO: raise an alert or open a ticket for the detection

    elif module == "aph":
        print(f"Antiphishing: {event.get('url')} {event.get('status')} on {event.get('computer_name')}")

    elif module == "avc":
        print(f"Advanced Threat Control: {event.get('exploit_path')} {event.get('status')} on {event.get('computer_name')}")

    elif module in ("fw", "hd", "dp", "network-sandboxing"):
        print(f"Detection event {module} on {event.get('computer_name')}")

    else:
        print(f"Unhandled Bitdefender event module: {module}")


@app.post("/webhooks/bitdefender", dependencies=[Depends(require_bitdefender_auth)])
async def bitdefender_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        message = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # JSON-RPC 2.0: {jsonrpc, method: "addEvents", params: {events: [...]}, id}
    if not isinstance(message, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON-RPC object")
    params = message.get("params")
    events = params.get("events") if isinstance(params, dict) else None
    if message.get("method") != "addEvents" or not isinstance(events, list):
        raise HTTPException(status_code=400, detail="Expected an addEvents call with params.events")

    try:
        for event in events:
            if isinstance(event, dict):
                handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Bitdefender webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Any 2xx tells GravityZone the batch was received.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
