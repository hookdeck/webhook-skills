# Generated with: nexthink-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises TypeError on
    non-ASCII str, and works on bytes."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_nexthink_request(headers, config=os.environ) -> bool:
    """Nexthink does not sign payloads. The credential is the `Authorization` header built
    from the Bearer token connector credential ("<Header prefix> <Token>"). Compare the
    complete header value, including the scheme prefix; don't strip, parse or decode it.

    A static credential authenticates the sender, not the body, and gives no replay
    protection: use HTTPS and rotate the credential if it leaks.
    """
    expected = config.get("NEXTHINK_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_nexthink_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_nexthink_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload) -> None:
    """Nexthink adds no event field: the body is the JSON template you wrote on the webhook.
    This example uses an ILLUSTRATIVE template where `event` is a field you chose:
      { "event": "alert triggered", "monitor": "{{alert.monitor.name}}" }
    """
    body = payload if isinstance(payload, dict) else {}
    event = body.get("event")

    if event == "alert triggered":
        print(f"Alert triggered: {body.get('monitor')}")
        # TODO: open a ticket or notify the on-call channel

    elif event == "alert recovered":
        print(f"Alert recovered: {body.get('monitor')}")
        # TODO: resolve the ticket

    else:
        print('Unrecognised Nexthink payload (no matching "event" in your template)')


# The request method is chosen on the Nexthink webhook: POST, PUT or PATCH.
@app.api_route(
    "/webhooks/nexthink",
    methods=["POST", "PUT", "PATCH"],
    dependencies=[Depends(require_nexthink_auth)],
)
async def nexthink_webhook(request: Request):
    # Read the raw body so any content type works. The body may be empty.
    raw_body = await request.body()

    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Nexthink webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
