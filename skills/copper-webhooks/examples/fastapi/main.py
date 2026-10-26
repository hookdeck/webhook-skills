# Generated with: copper-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

TYPES = ["lead", "person", "company", "opportunity", "project", "task", "activity_log"]
EVENTS = ["new", "update", "delete"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_copper_request(headers, expected=None) -> bool:
    """Copper does not sign payloads. Authenticate with a secret header you add through the
    subscription's "headers" object. The header name is yours (COPPER_WEBHOOK_HEADER) and the
    expected value is the exact, whole header value (COPPER_WEBHOOK_SECRET): no 'Bearer ' parsing.
    A static credential authenticates the sender, not the body, and gives no replay protection.
    """
    expected = expected if expected is not None else os.environ.get("COPPER_WEBHOOK_SECRET")
    if not expected:
        return False  # never accept when unconfigured
    name = os.environ.get("COPPER_WEBHOOK_HEADER", "X-Webhook-Secret").lower()
    received = next((v for k, v in headers.items() if k.lower() == name), None)
    return bool(received) and safe_equal(received, expected)


async def require_copper_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_copper_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(payload: dict) -> None:
    ids = ", ".join(str(i) for i in payload["ids"])
    kind = payload["type"]
    event = payload["event"]

    # Dispatch on type + event.
    key = f"{kind}.{event}"

    if key == "person.new":
        print(f"New person(s): {ids}")
        # TODO: fetch GET /people/{id} and sync to your system

    elif key == "person.update":
        print(f"Person(s) updated: {ids}", payload.get("updated_attributes") or {})
        # TODO: apply payload["updated_attributes"]

    elif key == "opportunity.update":
        print(f"Opportunity(ies) updated: {ids}")
        # TODO: check stage / status changes

    elif key == "lead.delete":
        print(f"Lead(s) deleted: {ids}")
        # TODO: remove the leads downstream

    elif kind in TYPES and event in EVENTS:
        print(f"Copper {kind} {event}: {ids}")
        # TODO: handle company, project, task and activity_log records

    else:
        print(f"Unhandled event: {key}")


@app.post("/webhooks/copper", dependencies=[Depends(require_copper_secret)])
async def copper_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("ids"), list)
        or not isinstance(payload.get("type"), str)
        or not isinstance(payload.get("event"), str)
    ):
        raise HTTPException(status_code=400, detail="Expected an object with ids, type and event")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Copper event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
