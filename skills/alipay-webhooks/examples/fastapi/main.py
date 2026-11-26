# Generated with: alipay-webhooks skill
# https://github.com/hookdeck/webhook-skills
#
# Receive and verify Alipay (Antom / Alipay+) webhooks with FastAPI.
# There is no official Alipay SDK helper for notification verification across
# frameworks, so this uses `cryptography` directly (standard SHA256withRSA).

import base64
import json
import os
from datetime import datetime, timezone
from urllib.parse import unquote

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

CLIENT_ID = os.environ.get("ALIPAY_CLIENT_ID", "")
ALIPAY_PUBLIC_KEY = os.environ.get("ALIPAY_PUBLIC_KEY", "")  # verifies inbound

WEBHOOK_PATH = "/webhooks/alipay"

# The acknowledgement body Antom expects, with fixed values. No signature is required.
ACK_BODY = json.dumps(
    {"result": {"resultCode": "SUCCESS", "resultStatus": "S", "resultMessage": "success"}},
    separators=(",", ":"),
)


def _normalize_pem(pem: str) -> str:
    # PEM values are commonly stored on one line with literal "\n".
    return (pem or "").replace("\\n", "\n")


def parse_signature_header(header: str) -> dict:
    out = {}
    for part in (header or "").split(","):
        if "=" in part:
            key, value = part.split("=", 1)
            out[key.strip()] = value.strip()
    return out


def _build_signed_content(method: str, uri: str, client_id: str, time: str, body: str) -> bytes:
    # Two-line content: "<METHOD> <URI>\n<Client-Id>.<Time>.<Body>"
    return f"{method} {uri}\n{client_id}.{time}.{body}".encode("utf-8")


def verify_alipay_signature(method, uri, client_id, request_time, raw_body, signature_header) -> bool:
    parsed = parse_signature_header(signature_header or "")
    sig_b64 = parsed.get("signature")
    if not sig_b64 or not client_id or not request_time:
        return False

    content = _build_signed_content(method, uri, client_id, request_time, raw_body)

    # Antom base64-encodes, then URL-encodes: unquote, accept URL-safe base64, pad, decode.
    normalized = unquote(sig_b64).replace("-", "+").replace("_", "/")
    normalized += "=" * (-len(normalized) % 4)
    try:
        signature = base64.b64decode(normalized)
    except (ValueError, base64.binascii.Error):
        return False

    try:
        public_key = serialization.load_pem_public_key(_normalize_pem(ALIPAY_PUBLIC_KEY).encode("utf-8"))
        public_key.verify(signature, content, padding.PKCS1v15(), hashes.SHA256())
        return True
    except (InvalidSignature, ValueError):
        return False


def ack() -> Response:
    # Antom resends the notification until it gets this fixed body; no signature needed.
    return Response(
        content=ACK_BODY,
        status_code=200,
        media_type="application/json",
        headers={
            "Client-Id": CLIENT_ID,
            "Response-Time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    )


def notification_type(event: dict):
    # The event type sits in a different field per notification API.
    return (
        event.get("notifyType")  # notifyPayment, notifyCapture, notifyRefund, notifyReversal
        or event.get("authorizationNotifyType")  # notifyAuthorization
        or event.get("disputeNotificationType")  # notifyDispute
        or event.get("subscriptionNotificationType")  # notifySubscription
    )  # notifyVaulting and the subscription notifyPayment carry no type


@app.post(WEBHOOK_PATH)
async def alipay_webhook(request: Request):
    # Read the RAW body — the signature covers the exact bytes. Do not parse first.
    raw_body = (await request.body()).decode("utf-8")

    client_id = request.headers.get("client-id")
    request_time = request.headers.get("request-time")
    signature_header = request.headers.get("signature")

    if not signature_header or not client_id or not request_time:
        return Response(content="Missing Alipay signature headers", status_code=400)

    valid = verify_alipay_signature(
        method="POST",
        uri=WEBHOOK_PATH,
        client_id=client_id,
        request_time=request_time,
        raw_body=raw_body,
        signature_header=signature_header,
    )
    if not valid:
        return Response(content="Invalid signature", status_code=401)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    # result.resultStatus is S (success) or F (failure) where a body has it.
    status = (event.get("result") or {}).get("resultStatus")
    event_type = notification_type(event)

    if event_type == "PAYMENT_RESULT":
        # Final result. Deduplicate on notifyType + paymentId; only S means paid.
        print("Payment result:", event.get("paymentRequestId"), event.get("paymentId"), status)
        # Your code: if status == "S": fulfill the order
    elif event_type == "PAYMENT_PENDING":
        # The buyer has paid; wait for PAYMENT_RESULT. Never overwrite a final result.
        print("Payment pending:", event.get("paymentRequestId"), event.get("paymentId"))
    elif event_type == "CAPTURE_RESULT":
        print("Capture result:", event.get("captureRequestId"), event.get("captureId"), status)
    elif event_type == "REFUND_RESULT":
        print("Refund result:", event.get("refundRequestId"), event.get("refundId"), event.get("refundStatus"))
    elif event_type == "AUTHCODE_CREATED":
        # Exchange event["authCode"] for an access token with applyToken.
        print("Authorization code created:", event.get("authState"))
    elif event_type in ("TOKEN_CREATED", "TOKEN_CANCELED"):
        print("Authorization:", event_type, event.get("authState"))
    elif event_type in ("DISPUTE_CREATED", "DEFENSE_DUE_ALERT", "DISPUTE_JUDGED"):
        print("Dispute:", event_type, event.get("disputeId"), event.get("paymentId"))
    else:
        # Acknowledge types you don't handle too, or Antom keeps resending them.
        print("Unhandled notification type:", event_type)

    # The fixed body so Antom stops resending.
    return ack()


@app.get("/health")
async def health():
    return {"status": "ok"}
