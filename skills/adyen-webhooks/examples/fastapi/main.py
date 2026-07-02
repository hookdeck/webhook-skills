# Generated with: adyen-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import binascii
import hashlib
import hmac
import os
import secrets

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException

load_dotenv()

app = FastAPI()

HMAC_KEY = os.environ.get("ADYEN_HMAC_KEY", "")

# Fields that make up the HMAC signing string, in the exact order Adyen uses.
# (amount is flattened into value + currency.)
_SIGNED_FIELDS = (
    "pspReference",
    "originalReference",
    "merchantAccountCode",
    "merchantReference",
    "value",
    "currency",
    "eventCode",
    "success",
)


def _escape(value) -> str:
    """Escape backslash then colon in a field value, matching Adyen."""
    return str(value).replace("\\", "\\\\").replace(":", "\\:")


def calculate_hmac(item: dict, hex_key: str) -> str:
    """Compute the base64 HMAC-SHA256 signature for a NotificationRequestItem.

    Adyen signs a ':'-delimited string of specific fields (NOT the raw body).
    Empty/missing fields become empty strings. The Customer Area HMAC key is a
    hex string that must be hex-decoded before use.
    """
    amount = item.get("amount") or {}
    values = {
        **{k: item.get(k, "") for k in _SIGNED_FIELDS if k not in ("value", "currency")},
        "value": amount.get("value", ""),
        "currency": amount.get("currency", ""),
    }
    signing_string = ":".join(_escape(values[field]) for field in _SIGNED_FIELDS)

    key = binascii.unhexlify(hex_key)  # hex string -> raw bytes
    digest = hmac.new(key, signing_string.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def is_valid_hmac(item: dict, hex_key: str) -> bool:
    """Timing-safe check of an item's additionalData.hmacSignature."""
    received = (item.get("additionalData") or {}).get("hmacSignature", "")
    if not received:
        return False
    try:
        expected = calculate_hmac(item, hex_key)
    except (binascii.Error, ValueError):
        return False
    return hmac.compare_digest(expected, received)


def check_basic_auth(auth_header: str | None) -> bool:
    """Optional Basic Auth. Only enforced when both env vars are configured."""
    user = os.environ.get("ADYEN_WEBHOOK_USERNAME")
    password = os.environ.get("ADYEN_WEBHOOK_PASSWORD")
    if not user or not password:
        return True  # Basic Auth not configured

    if not auth_header or not auth_header.startswith("Basic "):
        return False
    try:
        decoded = base64.b64decode(auth_header[6:]).decode("utf-8")
    except (binascii.Error, ValueError):
        return False
    got_user, _, got_pass = decoded.partition(":")
    return secrets.compare_digest(got_user, user) and secrets.compare_digest(got_pass, password)


def handle_notification(item: dict) -> None:
    """Process a single verified NotificationRequestItem."""
    event_code = item.get("eventCode")
    ok = item.get("success") == "true"  # success is a string "true"/"false"
    psp = item.get("pspReference")

    if event_code == "AUTHORISATION":
        # success == "false" means the payment was REFUSED.
        state = "succeeded" if ok else "refused"
        print(f"AUTHORISATION {state} for {item.get('merchantReference')} ({psp})")
        # TODO: fulfil the order on success, notify the shopper on refusal.
    elif event_code == "CAPTURE":
        print(f"CAPTURE {'succeeded' if ok else 'failed'} for {psp}")
    elif event_code == "CAPTURE_FAILED":
        print(f"CAPTURE_FAILED for {psp}")
    elif event_code == "REFUND":
        print(f"REFUND {'succeeded' if ok else 'failed'} for {psp}")
    elif event_code == "REFUND_FAILED":
        print(f"REFUND_FAILED for {psp}")
    elif event_code == "CANCELLATION":
        print(f"CANCELLATION {'succeeded' if ok else 'failed'} for {psp}")
    elif event_code == "CANCEL_OR_REFUND":
        print(f"CANCEL_OR_REFUND {'succeeded' if ok else 'failed'} for {psp}")
    elif event_code == "CHARGEBACK":
        print(f"CHARGEBACK for {psp}")
    elif event_code == "NOTIFICATION_OF_CHARGEBACK":
        print(f"NOTIFICATION_OF_CHARGEBACK for {psp}")
    elif event_code == "REPORT_AVAILABLE":
        print(f"REPORT_AVAILABLE: {item.get('reason', '')}")
    else:
        print(f"Unhandled eventCode: {event_code} ({psp})")


@app.post("/webhooks/adyen")
async def adyen_webhook(request: Request):
    # 1. Optional Basic Auth
    if not check_basic_auth(request.headers.get("authorization")):
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Adyen posts JSON. HMAC is over reconstructed fields (not the raw body),
    # so parsing the JSON before verifying is correct for Adyen.
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    items = body.get("notificationItems") if isinstance(body, dict) else None
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="Invalid notification")

    # 2. Verify the HMAC signature on every item before processing any of them.
    for entry in items:
        item = entry.get("NotificationRequestItem") if isinstance(entry, dict) else None
        if not item or not is_valid_hmac(item, HMAC_KEY):
            raise HTTPException(status_code=401, detail="Invalid HMAC signature")

    # 3. All items verified — process them.
    for entry in items:
        handle_notification(entry["NotificationRequestItem"])

    # 4. Acknowledge with the literal body Adyen expects.
    return Response(content="[accepted]", media_type="text/plain")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
