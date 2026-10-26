# Generated with: planetscale-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import re
import hmac
import hashlib
import json
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()

# Exactly 64 hex characters (fullmatch: `$` would also accept a trailing newline)
SIGNATURE_RE = re.compile(r"[0-9a-fA-F]{64}")


def verify_planetscale_webhook(raw_body: bytes, signature_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify a PlanetScale webhook signature (X-PlanetScale-Signature: bare hex HMAC-SHA256).

    The HMAC key is the webhook secret as UTF-8, used as-is.
    """
    if not signature_header or not secret:
        return False
    if not SIGNATURE_RE.fullmatch(signature_header):
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Compare bytes: compare_digest raises TypeError on non-ASCII str, which would be a 500
    return hmac.compare_digest(signature_header.lower().encode("utf-8"), expected.encode("utf-8"))


@app.post("/webhooks/planetscale")
async def planetscale_webhook(request: Request):
    # Raw bytes: the signature covers exactly what PlanetScale sent
    raw_body = await request.body()
    signature_header = request.headers.get("x-planetscale-signature")

    # Read the secret per request so it can be configured after import
    if not verify_planetscale_webhook(raw_body, signature_header, os.environ.get("PLANETSCALE_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse the payload only after verification, and treat every field as untrusted
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    event = payload.get("event") if isinstance(payload.get("event"), str) else None
    resource = payload.get("resource") if isinstance(payload.get("resource"), dict) else {}
    database = payload.get("database") if isinstance(payload.get("database"), str) else None
    # No delivery ID header: dedupe on event + resource.id + timestamp if you need idempotency

    if event == "webhook.test":
        print(f"Received webhook.test for database {database}")

    elif event == "branch.ready":
        print(f"Branch {resource.get('name')} is ready on {database}")
        # TODO: Run migrations, post connection details to a channel

    elif event == "branch.anomaly":
        print(f"Anomaly on branch {resource.get('name')} of {database}: {resource.get('html_url')}")
        # TODO: Page on-call, open a ticket

    elif event in ("deploy_request.opened", "deploy_request.queued", "deploy_request.in_progress"):
        print(
            f"{event}: deploy request #{resource.get('number')} "
            f"({resource.get('branch')} -> {resource.get('into_branch')}) on {database}"
        )
        # TODO: Notify reviewers, update the linked ticket or CI status

    elif event == "backup.failed":
        print(f"Backup {resource.get('name')} failed on {database}")
        # TODO: Alert the team

    elif event == "backup.succeeded":
        print(f"Backup {resource.get('name')} succeeded on {database}")
        # TODO: Record backup health

    elif event == "cluster.storage":
        print(f"Storage at {resource.get('storage_percentage')}% on {resource.get('branch_name')} ({database})")
        # TODO: Capacity alert

    elif event == "database.access_request":
        print(f"PlanetScale access request ({resource.get('state')}) on {database}")
        # TODO: Notify database admins to review it

    else:
        print(f"Unhandled event: {event}")

    # Return 200 quickly: PlanetScale waits 2 seconds, then marks the delivery failed
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
