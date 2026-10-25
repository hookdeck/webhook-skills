# Generated with: acumatica-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_acumatica_request(headers, env=None) -> bool:
    """Acumatica does not sign push notifications. The Webhook destination adds one
    user-chosen header (Header Name / Header Value). Starlette headers are
    case-insensitive; compare the WHOLE value and do not strip a "Bearer " prefix.
    """
    env = os.environ if env is None else env
    secret = env.get("ACUMATICA_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    name = env.get("ACUMATICA_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(name)
    return received is not None and safe_equal(received, secret)


async def require_acumatica_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_acumatica_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing authentication header")


def classify_change(payload: dict) -> str:
    """Inserted only = inserted, Deleted only = deleted, both = updated."""
    inserted = payload.get("Inserted")
    deleted = payload.get("Deleted")
    inserted = inserted if isinstance(inserted, list) else []
    deleted = deleted if isinstance(deleted, list) else []
    if inserted and deleted:
        return "updated"
    if inserted:
        return "inserted"
    if deleted:
        return "deleted"
    return "empty"


# Acumatica resends on error, so dedupe on the transaction Id (use a shared store in production).
_seen: set = set()


def handle_notification(payload: dict) -> None:
    notification_id = payload.get("Id")
    if notification_id and notification_id in _seen:
        print(f"Duplicate notification {notification_id}, skipping")
        return
    if notification_id:
        _seen.add(notification_id)

    # There is no event-type field: the Query name identifies the notification.
    query = payload.get("Query")
    tenant = payload.get("CompanyId")
    change = classify_change(payload)

    if change == "inserted":
        print(f"[{tenant}] {query}: {len(payload['Inserted'])} row(s) inserted")
        # TODO: create the records downstream (payload["Inserted"])

    elif change == "deleted":
        print(f"[{tenant}] {query}: {len(payload['Deleted'])} row(s) deleted")
        # TODO: remove or archive the records (payload["Deleted"])

    elif change == "updated":
        print(f"[{tenant}] {query}: rows updated")
        # TODO: compare payload["Deleted"] (old values) with payload["Inserted"] (new values)

    else:
        print(f"[{tenant}] {query}: notification without rows")


@app.post("/webhooks/acumatica", dependencies=[Depends(require_acumatica_header)])
async def acumatica_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_notification(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Acumatica notification: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
