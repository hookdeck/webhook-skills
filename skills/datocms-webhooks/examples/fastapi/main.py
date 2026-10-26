# Generated with: datocms-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

_BASIC = re.compile(r"basic\s+([A-Za-z0-9+/]+={0,2})\s*", re.IGNORECASE)


def verify_datocms_request(headers, username=None, password=None) -> bool:
    """DatoCMS does not sign payloads. If the webhook has HTTP basic auth set, every request
    carries `Authorization: Basic base64(username:password)`. This authenticates the sender
    only: it does not cover the body and gives no replay protection, so use HTTPS and rotate
    the credentials if they leak.
    """
    username = username if username is not None else os.environ.get("DATOCMS_WEBHOOK_USERNAME")
    password = password if password is not None else os.environ.get("DATOCMS_WEBHOOK_PASSWORD")
    if not username or not password:
        return False  # never accept when unconfigured

    # Scheme is case-insensitive.
    match = _BASIC.fullmatch(headers.get("authorization", ""))
    if not match:
        return False
    try:
        decoded = base64.b64decode(match.group(1), validate=True)
    except (binascii.Error, ValueError):
        return False

    # Split on the first colon: passwords may contain ':'.
    got_user, sep, got_pass = decoded.partition(b":")
    if not sep:
        return False

    # compare_digest on bytes (str raises on non-ASCII); evaluate both, no short-circuit.
    user_ok = hmac.compare_digest(got_user, username.encode("utf-8"))
    pass_ok = hmac.compare_digest(got_pass, password.encode("utf-8"))
    return user_ok and pass_ok


async def require_datocms_credentials(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_datocms_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credentials")


def handle_event(payload: dict) -> None:
    entity_type = payload.get("entity_type")
    event_type = payload.get("event_type")
    entity = payload.get("entity")
    entity_id = entity.get("id") if isinstance(entity, dict) else None
    key = f"{entity_type} {event_type}"

    if key == "item create":
        print(f"Record created: {entity_id}")
        # TODO: index the new record

    elif key == "item update":
        print(f"Record updated: {entity_id}")
        # TODO: diff payload["previous_entity"] against payload["entity"]

    elif key == "item delete":
        print(f"Record deleted: {entity_id}")
        # TODO: remove the record from external systems

    elif key == "item publish":
        print(f"Record published: {entity_id}")
        # TODO: trigger a site rebuild or sync published content

    elif key == "item unpublish":
        print(f"Record unpublished: {entity_id}")
        # TODO: remove the record from public search

    elif key in ("item_type create", "item_type update", "item_type delete"):
        print(f"Model {event_type}: {entity_id}")
        # TODO: sync the schema

    elif key in ("upload create", "upload update", "upload delete"):
        print(f"Upload {event_type}: {entity_id}")
        # TODO: sync the asset to your CDN

    elif key in (
        "build_trigger deploy_started",
        "build_trigger deploy_succeeded",
        "build_trigger deploy_failed",
    ):
        print(f"Build trigger {event_type}: {entity_id}")
        # TODO: post a deploy notification

    elif key in (
        "environment deploy_started",
        "environment deploy_succeeded",
        "environment deploy_failed",
    ):
        print(f"Environment {event_type}: {entity_id}")
        # TODO: post a deploy notification

    elif key == "maintenance_mode change":
        print("Maintenance mode changed")
        # TODO: pause integrations while maintenance mode is on

    elif key == "sso_user create":
        print(f"SSO user added: {entity_id}")
        # TODO: audit the new collaborator

    elif key == "cda_cache_tags invalidate":
        print("CDA cache tags invalidated")
        # TODO: purge your cache (payload["entity"] holds the tags)

    else:
        # Custom payloads may omit entity_type / event_type; acknowledge them anyway.
        print(f"Unhandled event: {key}")


@app.post("/webhooks/datocms", dependencies=[Depends(require_datocms_credentials)])
async def datocms_webhook(request: Request):
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
        print(f"Error handling DatoCMS event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
