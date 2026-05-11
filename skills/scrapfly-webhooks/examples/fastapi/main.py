# Generated with: scrapfly-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="Scrapfly Webhook Handler")


def verify_scrapfly_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    secret: str,
) -> bool:
    """Verify a Scrapfly webhook signature.

    Algorithm: upper(hex(HMAC_SHA256(secret, raw_body)))
    Header:    X-Scrapfly-Webhook-Signature (uppercase hex)
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest().upper()

    # Scrapfly also sends an X-Scrapfly-Webhook-Signature-Lowercase variant;
    # normalise both sides to uppercase before constant-time comparison.
    return hmac.compare_digest(expected, signature_header.upper())


@app.post("/webhooks/scrapfly")
async def scrapfly_webhook(
    request: Request,
    x_scrapfly_webhook_signature: Optional[str] = Header(
        None, alias="x-scrapfly-webhook-signature"
    ),
    x_scrapfly_webhook_resource_type: Optional[str] = Header(
        None, alias="x-scrapfly-webhook-resource-type"
    ),
    x_scrapfly_webhook_id: Optional[str] = Header(
        None, alias="x-scrapfly-webhook-id"
    ),
    x_scrapfly_webhook_job_id: Optional[str] = Header(
        None, alias="x-scrapfly-webhook-job-id"
    ),
    x_scrapfly_crawl_event_name: Optional[str] = Header(
        None, alias="x-scrapfly-crawl-event-name"
    ),
):
    # Read the raw body before any JSON parsing — re-serialising mutates bytes
    # and breaks the signature.
    raw_body = await request.body()

    secret = os.environ.get("SCRAPFLY_WEBHOOK_SECRET")
    if not secret:
        print("ERROR: SCRAPFLY_WEBHOOK_SECRET is not configured")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    if not verify_scrapfly_signature(raw_body, x_scrapfly_webhook_signature, secret):
        print("ERROR: Scrapfly webhook signature verification failed")
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: Failed to parse Scrapfly webhook payload: {exc}")
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    print(
        f"Scrapfly webhook (id={x_scrapfly_webhook_id} "
        f"resource={x_scrapfly_webhook_resource_type} job={x_scrapfly_webhook_job_id})"
    )

    resource_type = x_scrapfly_webhook_resource_type

    if resource_type == "scrape":
        # Scrape API places the fetched URL at result.url. The webhook overlay's
        # payload["context"] only carries `webhook` and `job` sub-objects.
        result = payload.get("result", {})
        print(f"Scrape result: url={result.get('url')} status={result.get('status_code')}")
        # TODO: Persist HTML / extracted fields, enqueue parsing
    elif resource_type == "extraction":
        print(f"Extraction result: {payload.get('result', {}).get('data')}")
        # TODO: Save structured data, trigger enrichment
    elif resource_type == "screenshot":
        print(f"Screenshot URL: {payload.get('result', {}).get('screenshot_url')}")
        # TODO: Store image, generate thumbnail
    else:
        # Crawler API uses lifecycle events in the body.
        event = x_scrapfly_crawl_event_name or payload.get("event")
        crawler_payload = payload.get("payload", {})

        if event == "crawler_started":
            print(f"Crawler started: {crawler_payload.get('crawler_uuid')}")
        elif event == "crawler_url_visited":
            print(f"Crawler visited: {crawler_payload.get('url')}")
        elif event == "crawler_url_discovered":
            print(f"Crawler discovered: {crawler_payload.get('url')}")
        elif event == "crawler_url_skipped":
            print(f"Crawler skipped: {crawler_payload.get('url')}")
        elif event == "crawler_url_failed":
            print(f"Crawler failed: {crawler_payload.get('url')}")
        elif event == "crawler_stopped":
            print(f"Crawler stopped: {crawler_payload.get('crawler_uuid')}")
        elif event == "crawler_cancelled":
            print(f"Crawler cancelled: {crawler_payload.get('crawler_uuid')}")
        elif event == "crawler_finished":
            print(f"Crawler finished: {crawler_payload.get('crawler_uuid')}")
        else:
            print(f"Unhandled Scrapfly webhook: resource={resource_type} event={event}")

    return {"received": True}


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
