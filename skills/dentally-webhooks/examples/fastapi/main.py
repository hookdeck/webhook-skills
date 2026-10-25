# Generated with: dentally-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse, PlainTextResponse

load_dotenv()

app = FastAPI()


def verify_dentally_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """
    Dentally signs the raw POST body with HMAC-SHA256 keyed on the webhook
    endpoint's secret (UTF-8) and sends a bare lowercase hex digest in
    X-Dentally-Signature (no prefix, no timestamp).
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest().encode()
    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500
    return hmac.compare_digest(expected, signature_header.lower().encode())


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/dentally")
async def dentally_webhook(request: Request):
    # Raw body: parsing JSON first would change the signed bytes
    raw_body = await request.body()
    signature = request.headers.get("x-dentally-signature")

    if not signature:
        return PlainTextResponse("Missing X-Dentally-Signature header", status_code=400)

    secret = os.getenv("DENTALLY_WEBHOOK_SECRET", "")
    if not verify_dentally_signature(raw_body, signature, secret):
        return PlainTextResponse("Invalid signature", status_code=401)

    try:
        payload = json.loads(raw_body)
    except ValueError:
        return PlainTextResponse("Invalid JSON", status_code=400)

    if not isinstance(payload, dict):
        return PlainTextResponse("Invalid payload", status_code=400)

    # Payload shape: {data, event, object, user}
    event = payload.get("event")
    data = payload.get("data") or {}

    if event == "appointment.created":
        print(f"Appointment created: {data.get('id')}")
    elif event == "appointment.updated":
        print(f"Appointment updated: {data.get('id')} {data.get('state')}")
    elif event == "appointment.deleted":
        print(f"Appointment deleted: {data.get('id')}")
    elif event == "patient.created":
        print(f"Patient created: {data.get('id')}")
    elif event == "patient.updated":
        print(f"Patient updated: {data.get('id')}")
    elif event == "patient.deleted":
        print(f"Patient deleted: {data.get('id')}")
    elif event == "payment.created":
        print(f"Payment created: {data.get('id')}")
    elif event == "payment.updated":
        print(f"Payment updated: {data.get('id')}")
    elif event == "payment.deleted":
        print(f"Payment deleted: {data.get('id')}")
    else:
        # Dentally may add events at any time: ignore unknown ones with 204
        print(f"Unhandled Dentally event: {event}")
        return Response(status_code=204)

    return JSONResponse({"received": True})
