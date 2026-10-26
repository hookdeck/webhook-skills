# Generated with: tray-io-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_tray_request(headers, header_name=None, secret=None) -> bool:
    """Tray.io requests are unsigned. The workflow's HTTP Client step adds a secret header
    (name chosen by the user, value from a Generic Service Authentication). We compare the
    WHOLE header value, including any "Bearer " prefix, and never strip or parse it.
    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    header_name = header_name or os.environ.get("TRAY_IO_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("TRAY_IO_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # compare_digest raises TypeError on non-ASCII str, so compare bytes. Starlette decodes
    # header bytes as latin-1, so re-encoding as latin-1 recovers what was sent.
    return hmac.compare_digest(received.encode("latin-1"), secret.encode("utf-8"))


async def require_tray_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read or parsed."""
    if not verify_tray_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credential header")


# The "event" field is a convention: Tray defines no event types.
def handle_event(payload: dict) -> None:
    event = payload.get("event")
    data = payload.get("data")

    if event == "record.created":
        print(f"Record created: {data}")
        # TODO: create the record in your system

    elif event == "record.updated":
        print(f"Record updated: {data}")
        # TODO: update the record in your system

    elif event == "record.deleted":
        print(f"Record deleted: {data}")
        # TODO: remove the record from your system

    else:
        print(f"Unhandled event: {event}")


# The method is chosen in the workflow, so accept all of them.
@app.api_route(
    "/webhooks/tray-io",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    dependencies=[Depends(require_tray_credential)],
)
async def tray_webhook(request: Request):
    # Read the raw body so any content type is accepted; GET has an empty body.
    raw_body = await request.body()
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Tray.io request: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
