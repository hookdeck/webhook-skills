# Generated with: tripletex-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

CRUD_OBJECTS = [
    "supplier", "employee", "order", "product", "account", "project",
    "customer", "contact", "archiverelation", "voucher",
]
CRUD_VERBS = ["create", "update", "delete"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison: compare_digest on equal-length digests (bytes, never str)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_tripletex_request(headers, secret=None, header_name=None) -> bool:
    """Tripletex does not sign payloads. If you set authHeaderName / authHeaderValue on the
    event subscription, Tripletex sends that header as-is on every callback. Compare the
    WHOLE value (do not strip or parse a "Bearer " prefix).
    """
    secret = secret if secret is not None else os.environ.get("TRIPLETEX_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TRIPLETEX_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # request.headers is case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_tripletex_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_tripletex_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing authentication header")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    object_id = payload.get("id")

    if event == "invoice.charged":
        print(f"Invoice charged: {object_id}")
        # TODO: sync the invoice (payload["value"] is the invoice DTO)
        return

    if event == "notification.sent":
        print(f"Notification sent: {object_id}")
        # TODO: surface the notification to the employee
        return

    if event == "voucherstatus.ready":
        print(f"Voucher ready for processing: {object_id}")
        # TODO: fetch the voucher from the voucher reception
        return

    if event == "closegroup.create":
        print(f"Close group created: {object_id}")
        # TODO: store payload["value"] postings; fires on automatic closes (e.g. OCR matching) too
        return

    if event == "closegroup.delete":
        print(f"Close group deleted: {object_id}")
        # TODO: value is null; reopen the postings you stored from closegroup.create
        return

    obj, _, verb = str(event).partition(".")
    if obj in CRUD_OBJECTS and verb in CRUD_VERBS:
        if verb == "delete":
            print(f"{obj} deleted: {object_id}")  # value is null, only the id is sent
            # TODO: remove the local copy of the object
        else:
            print(f"{obj} {verb}d: {object_id}")
            # TODO: upsert value (the DTO), ignoring versions older than the stored one
        return

    print(f"Unhandled event: {event}")


@app.post("/webhooks/tripletex", dependencies=[Depends(require_tripletex_header)])
async def tripletex_webhook(request: Request):
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
        print(f"Error handling Tripletex event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
