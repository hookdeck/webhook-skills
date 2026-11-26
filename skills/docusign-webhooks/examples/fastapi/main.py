# Generated with: docusign-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

docusign_secret = os.environ.get("DOCUSIGN_HMAC_SECRET")


def verify_docusign_webhook(raw_body: bytes, headers, secret: str) -> bool:
    """Verify a DocuSign Connect webhook signature.

    DocuSign signs the raw request body with HMAC-SHA256 keyed on the Connect
    HMAC secret and sends the base64 digest in ``X-DocuSign-Signature-1``. When
    multiple HMAC keys are active it sends one header per key
    (``X-DocuSign-Signature-1``, ``-2``, ...). Only one header needs to match.
    """
    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode("utf-8")

    signatures = [
        value
        for key, value in headers.items()
        if key.lower().startswith("x-docusign-signature-")
    ]
    return any(hmac.compare_digest(sig, expected) for sig in signatures)


@app.post("/webhooks/docusign")
async def docusign_webhook(request: Request):
    # Read the raw body for signature verification (do not parse first)
    raw_body = await request.body()

    # Verify webhook signature against every X-DocuSign-Signature-N header
    if not verify_docusign_webhook(raw_body, request.headers, docusign_secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload after verification
    payload = json.loads(raw_body)
    event = payload.get("event")
    envelope_id = (payload.get("data") or {}).get("envelopeId")

    print(f"Received {event} event for envelope {envelope_id}")

    # Handle the event based on the `event` field in the JSON body
    if event == "envelope-sent":
        print(f"Envelope sent: {envelope_id}")
        # Your code: Track that the envelope was emailed to recipients

    elif event == "envelope-delivered":
        print(f"Envelope opened: {envelope_id}")
        # Your code: Update status to "viewed"

    elif event == "envelope-completed":
        print(f"Envelope completed: {envelope_id}")
        # Your code: Download signed documents, mark deal as signed, etc.

    elif event == "envelope-declined":
        print(f"Envelope declined: {envelope_id}")
        # Your code: Notify sender, halt workflow

    elif event == "envelope-voided":
        print(f"Envelope voided: {envelope_id}")
        # Your code: Clean up any pending state

    elif event == "recipient-sent":
        print(f"Recipient notified: {envelope_id}")
        # Your code: Track per-recipient delivery

    elif event == "recipient-delivered":
        print(f"Recipient opened documents: {envelope_id}")
        # Your code: Update per-recipient status

    elif event == "recipient-completed":
        print(f"Recipient completed: {envelope_id}")
        # Your code: Advance signing workflow to the next recipient

    elif event == "recipient-declined":
        print(f"Recipient declined: {envelope_id}")
        # Your code: Notify sender

    elif event == "recipient-authenticationfailed":
        print(f"Recipient authentication failed: {envelope_id}")
        # Your code: Flag for review

    else:
        print(f"Unhandled event: {event}")

    # Return 2xx to acknowledge receipt (DocuSign retries on >= 400 for up to 15 days)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
