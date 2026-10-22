# Generated with: doppler-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import hmac
import hashlib
import json
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_doppler_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a Doppler webhook signature (X-Doppler-Signature: sha256=<hex>)."""
    if not signature_header or not secret:
        return False

    # HMAC-SHA256 of the raw body, hex encoded, prefixed with "sha256="
    expected = "sha256=" + hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Use timing-safe comparison
    return hmac.compare_digest(signature_header.encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/doppler")
async def doppler_webhook(request: Request):
    # Raw bytes: the signature covers exactly what Doppler sent
    raw_body = await request.body()
    signature_header = request.headers.get("x-doppler-signature")

    # Read the secret per request so it can be configured after import
    if not verify_doppler_webhook(raw_body, signature_header, os.environ.get("DOPPLER_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Default payloads carry a type; custom JSON payloads do not
    event_type = payload.get("type") if isinstance(payload, dict) else None

    if event_type == "config.secrets.update":
        diff = payload.get("diff") or {}
        project = (payload.get("project") or {}).get("slug")
        config = (payload.get("config") or {}).get("name")
        print(
            f"Secrets changed in {project}/{config}: "
            f"+{len(diff.get('added', []))} -{len(diff.get('removed', []))} ~{len(diff.get('updated', []))}"
        )
        # TODO: Restart or redeploy the app, trigger a pipeline, etc.

    else:
        print(f"Unhandled payload (type: {event_type or 'none - custom payload'})")

    # Return 200 to acknowledge receipt
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
