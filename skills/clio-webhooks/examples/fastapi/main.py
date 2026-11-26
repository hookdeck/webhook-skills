# Generated with: clio-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException, Response

load_dotenv()

app = FastAPI()

clio_secret = os.environ.get("CLIO_WEBHOOK_SECRET")


def verify_clio_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify a Clio webhook signature.

    Clio sends the HMAC-SHA256 of the raw body (keyed with the shared secret) in
    the ``X-Hook-Signature`` header. Verify against the RAW body.

    Clio's docs compute a lowercase hex digest (`hexdigest`). We compute it once
    and also accept base64 as a safety net; the wrong encoding never matches.
    """
    if not signature_header:
        return False

    digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()

    # Hex per Clio's docs, base64 as a safety net — constant-time either way.
    return hmac.compare_digest(
        signature_header, digest.hex()
    ) or hmac.compare_digest(
        signature_header, base64.b64encode(digest).decode("utf-8")
    )


@app.post("/webhooks/clio")
async def clio_webhook(request: Request):
    # 1. Handshake: Clio sends X-Hook-Secret when the webhook is created or its
    #    URL changes. Confirm activation by echoing the secret back with 200.
    #    The webhook is not enabled until this handshake succeeds.
    hook_secret = request.headers.get("x-hook-secret")
    if hook_secret:
        print("Clio handshake received - confirming activation")
        return Response(status_code=200, headers={"X-Hook-Secret": hook_secret})
        # Tip: persist `hook_secret` (as CLIO_WEBHOOK_SECRET, keyed by webhook_id)
        # so you can verify signatures on later deliveries.

    # 2. Event delivery: verify the X-Hook-Signature over the raw body.
    raw_body = await request.body()
    signature_header = request.headers.get("x-hook-signature")

    if not verify_clio_webhook(raw_body, signature_header, clio_secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification.
    payload = json.loads(raw_body)
    meta = payload.get("meta", {})
    event = meta.get("event")
    webhook_id = meta.get("webhook_id")
    record = payload.get("data", {})

    print(f'Received "{event}" event (webhook: {webhook_id}, id: {record.get("id")})')

    # Handle the event based on meta.event.
    if event == "created":
        print(f"Record created: {record.get('id')}")
        # Your code: sync the new record into your system

    elif event == "updated":
        print(f"Record updated: {record.get('id')}")
        # Your code: update your local copy

    elif event == "deleted":
        print(f"Record deleted: {record.get('id')}")
        # Your code: soft-delete / archive locally

    elif event == "matter_opened":
        print(f"Matter opened: {record.get('id')}")
        # Your code: kick off intake / billing setup

    elif event == "matter_pended":
        print(f"Matter pended: {record.get('id')}")
        # Your code: pause automations

    elif event == "matter_closed":
        print(f"Matter closed: {record.get('id')}")
        # Your code: final invoicing / close-out

    else:
        print(f"Unhandled event: {event}")

    # Respond quickly (2xx) to acknowledge; defer heavy work.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
