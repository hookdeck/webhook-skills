# Generated with: nextcloud-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# httpMethod is a free string chosen when the webhook is registered.
ALLOWED_METHODS = ["POST", "PUT", "PATCH", "GET", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_nextcloud_request(headers, secret=None, header_name=None) -> bool:
    """Nextcloud does not sign payloads. With authMethod 'header', webhook_listeners merges
    authData ({header: value}) into the request headers. The header name is user-chosen, so
    both it and the expected value come from the environment. The WHOLE value is compared
    (a "Bearer " prefix typed into authData is part of the secret, not parsed off).
    """
    secret = secret if secret is not None else os.environ.get("NEXTCLOUD_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("NEXTCLOUD_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_nextcloud_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_nextcloud_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def _obj(value) -> dict:
    """Return value if it's a JSON object, else {} (fields may be missing or another type)."""
    return value if isinstance(value, dict) else {}


def handle_event(payload: dict) -> None:
    event = _obj(payload.get("event"))
    cls = event.get("class")
    user = _obj(payload.get("user"))
    uid = user.get("uid")
    node = _obj(event.get("node"))
    short_name = cls.split("\\")[-1] if isinstance(cls, str) else None

    if cls == "OCP\\Files\\Events\\Node\\NodeCreatedEvent":
        print(f"File created by {uid}: {node.get('path')}")
        # TODO: index the new file or kick off processing

    elif cls == "OCP\\Files\\Events\\Node\\NodeWrittenEvent":
        print(f"File written by {uid}: {node.get('path')}")
        # TODO: re-process the changed file

    elif cls == "OCP\\Files\\Events\\Node\\NodeTouchedEvent":
        print(f"File touched by {uid}: {node.get('path')}")

    elif cls == "OCP\\Files\\Events\\Node\\NodeDeletedEvent":
        # node.id is usually absent here; only node.path is present
        print(f"File deleted by {uid}: {node.get('path')}")
        # TODO: remove the file from your index

    elif cls in (
        "OCP\\Files\\Events\\Node\\NodeCopiedEvent",
        "OCP\\Files\\Events\\Node\\NodeRenamedEvent",
        "OCP\\Files\\Events\\Node\\NodeRestoredEvent",
    ):
        # two-node events carry event.source and event.target (either may lack an id)
        source = _obj(event.get("source")).get("path")
        target = _obj(event.get("target")).get("path")
        print(f"{short_name} by {uid}: {source} -> {target}")
        # TODO: update your copy of the path

    elif cls in ("OCP\\SystemTag\\TagAssignedEvent", "OCP\\SystemTag\\TagUnassignedEvent"):
        print(f"{short_name} by {uid}")
        # TODO: sync tags

    elif cls in (
        "OCP\\Calendar\\Events\\CalendarObjectCreatedEvent",
        "OCP\\Calendar\\Events\\CalendarObjectUpdatedEvent",
        "OCP\\Calendar\\Events\\CalendarObjectDeletedEvent",
    ):
        print(f"{short_name} by {uid} (calendar {event.get('calendarId')})")
        # TODO: sync the calendar object

    elif cls == "OCA\\Forms\\Events\\FormSubmittedEvent":
        print(f"Form submitted by {uid}")
        # TODO: process the submission

    else:
        print(f"Unhandled event: {cls}")


@app.api_route(
    "/webhooks/nextcloud",
    methods=ALLOWED_METHODS,
    dependencies=[Depends(require_nextcloud_credential)],
)
async def nextcloud_webhook(request: Request):
    # Read the raw body so any content type is accepted; GET/DELETE may have no body.
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
        print(f"Error handling Nextcloud event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
