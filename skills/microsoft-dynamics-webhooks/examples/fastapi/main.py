# Generated with: microsoft-dynamics-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Dynamics 365 (Dataverse) webhook receiver.

Webhooks are registered with the Plug-in Registration Tool.

1. They are NOT signed. There is no signature header, HMAC or timestamp.
   Register the webhook with the HttpHeader authentication option
   (e.g. ``X-Webhook-Secret: <hex>``) and compare it in constant time.
2. The body is a serialized RemoteExecutionContext. The event is ``MessageName``
   (Create, Update, Delete) and the table is ``PrimaryEntityName``.
"""

import hmac
import json
import logging
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("microsoft-dynamics-webhooks")
logging.basicConfig(level=logging.INFO)

DEFAULT_HEADER = "X-Webhook-Secret"

# MessageName values this handler covers.
CREATE = "Create"
UPDATE = "Update"
DELETE = "Delete"

app = FastAPI()


def verify_dynamics_secret(header_value: str | None) -> bool:
    """Compare the shared secret from the HttpHeader option in constant time.

    Raises RuntimeError when DYNAMICS_WEBHOOK_SECRET is unset (fail closed).
    """
    expected = os.environ.get("DYNAMICS_WEBHOOK_SECRET")
    if not expected:
        raise RuntimeError("DYNAMICS_WEBHOOK_SECRET is not set")
    if header_value is None:
        return False
    return hmac.compare_digest(header_value.encode(), expected.encode())


async def require_dynamics_secret(request: Request) -> None:
    """Dependency: check the shared-secret header before the body is read."""
    header_name = os.environ.get("DYNAMICS_WEBHOOK_HEADER") or DEFAULT_HEADER
    try:
        # Starlette headers are case-insensitive.
        ok = verify_dynamics_secret(request.headers.get(header_name))
    except RuntimeError as err:
        logger.error("Dynamics webhook misconfigured: %s", err)
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    if not ok:
        logger.error("Dynamics webhook rejected: %s missing or wrong", header_name)
        raise HTTPException(status_code=401, detail="Invalid webhook secret")


def flatten_attributes(entity: Any) -> dict[str, Any]:
    """Dataverse serializes attributes as [{"key": ..., "value": ...}]. Flatten to a dict."""
    out: dict[str, Any] = {}
    if isinstance(entity, dict) and isinstance(entity.get("Attributes"), list):
        for item in entity["Attributes"]:
            if isinstance(item, dict) and "key" in item:
                out[item["key"]] = item.get("value")
    return out


def get_target(context: dict[str, Any]) -> Any:
    """Find the Target entity in InputParameters. None when the payload exceeded 256 KB."""
    params = context.get("InputParameters")
    if not isinstance(params, list):
        return None
    for item in params:
        if isinstance(item, dict) and item.get("key") == "Target":
            return item.get("value")
    return None


def dedupe_key(context: dict[str, Any]) -> str | None:
    """Dataverse has no delivery ID, so dedupe on OperationId plus the step id."""
    operation_id = context.get("OperationId")
    if not operation_id:
        return None
    owner = context.get("OwningExtension")
    step_id = owner.get("Id", "") if isinstance(owner, dict) else ""
    return f"{operation_id}:{step_id}"


async def handle_create(context: dict[str, Any]) -> None:
    attrs = flatten_attributes(get_target(context))
    logger.info(
        "%s created: %s %s",
        context.get("PrimaryEntityName"),
        context.get("PrimaryEntityId"),
        attrs.get("fullname") or attrs.get("name") or "",
    )
    # TODO: create the record in your system.


async def handle_update(context: dict[str, Any]) -> None:
    attrs = flatten_attributes(get_target(context))
    logger.info(
        "%s updated: %s changed=%s",
        context.get("PrimaryEntityName"),
        context.get("PrimaryEntityId"),
        ",".join(attrs) or "n/a",
    )
    # TODO: sync the change. Update carries only the changed attributes, so upsert
    # on PrimaryEntityId or re-fetch the row from the Web API.


async def handle_delete(context: dict[str, Any]) -> None:
    logger.info("%s deleted: %s", context.get("PrimaryEntityName"), context.get("PrimaryEntityId"))
    # TODO: remove or archive the record.


async def dispatch(context: dict[str, Any]) -> bool:
    """Dispatch on MessageName. Returns whether the event was recognised."""
    message = context.get("MessageName")
    if message == CREATE:
        await handle_create(context)
        return True
    if message == UPDATE:
        await handle_update(context)
        return True
    if message == DELETE:
        await handle_delete(context)
        return True
    # Acknowledge messages this app doesn't handle.
    logger.warning("Unhandled Dataverse message: %s", message)
    return False


@app.post("/webhooks/microsoft-dynamics", dependencies=[Depends(require_dynamics_secret)])
async def dynamics_webhook(request: Request):
    raw_body = await request.body()
    try:
        context = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(context, dict) or not isinstance(context.get("MessageName"), str):
        raise HTTPException(status_code=400, detail="Missing MessageName")

    logger.info(
        "Dynamics webhook: %s %s key=%s%s",
        context["MessageName"],
        context.get("PrimaryEntityName", "n/a"),
        dedupe_key(context),
        " (payload over 256 KB: InputParameters removed)"
        if request.headers.get("x-ms-dynamics-msg-size-exceeded")
        else "",
    )

    try:
        await dispatch(context)
    except Exception as err:  # noqa: BLE001
        logger.error("Dynamics webhook processing failed: %s", err)
        # Non-2xx fails a synchronous step; 502/503/504 are retried once.
        raise HTTPException(status_code=500, detail="Processing failed")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
