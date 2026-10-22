# Generated with: firecrawl-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_firecrawl_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify X-Firecrawl-Signature: "sha256=<hex>", an HMAC-SHA256 of the raw body."""
    if not signature_header or not secret:
        return False

    algo, _, sig = signature_header.partition("=")
    if algo != "sha256" or not sig:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, expected)


@app.post("/webhooks/firecrawl")
async def firecrawl_webhook(request: Request):
    # Raw bytes: the signature covers the exact body sent
    raw_body = await request.body()
    signature = request.headers.get("x-firecrawl-signature")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing X-Firecrawl-Signature header")

    if not verify_firecrawl_webhook(raw_body, signature, os.getenv("FIRECRAWL_WEBHOOK_SECRET")):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse only after verification
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("type")
    job_id = event.get("id")
    data = event.get("data") or []

    if event_type in ("crawl.started", "batch_scrape.started", "extract.started"):
        print(f"{event_type}: job {job_id} started")
    elif event_type in ("crawl.page", "batch_scrape.page"):
        url = data[0].get("metadata", {}).get("url") if data else None
        print(f"{event_type}: job {job_id} scraped {url}")
        # TODO: store data[0]["markdown"], dedupe on event["webhookId"]
    elif event_type in ("crawl.completed", "batch_scrape.completed"):
        print(f"{event_type}: job {job_id} completed")
    elif event_type == "extract.completed":
        print(f"extract.completed: job {job_id}", data[0].get("data") if data else None)
    elif event_type == "extract.failed":
        print(f"extract.failed: job {job_id}: {event.get('error')}")
    elif event_type in ("agent.started", "agent.action", "agent.completed", "agent.failed", "agent.cancelled"):
        print(f"{event_type}: agent job {job_id}")
    elif event_type in ("monitor.page", "monitor.check.completed"):
        print(f"{event_type}: monitor {job_id}")
    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}
