# Generated with: vern-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from svix.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Vern Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/vern")
async def vern_webhook(request: Request):
    secret = os.environ.get("VERN_WEBHOOK_SECRET")
    if not secret or not secret.startswith("whsec_"):
        print("VERN_WEBHOOK_SECRET is missing or not a whsec_ secret")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the svix-* headers; when svix-id is absent, fall back to the webhook-* headers
    prefix = "svix" if request.headers.get("svix-id") else "webhook"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Vern (Svix) signed
    raw_body = await request.body()
    try:
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, signature
        # and enforces a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The library accepts either header-name set, so hand it the resolved values under both.
        Webhook(secret).verify(
            raw_body,
            {
                "svix-id": msg_id,
                "svix-timestamp": timestamp,
                "svix-signature": signature,
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except (WebhookVerificationError, ValueError) as err:
        # A malformed signature entry raises a plain ValueError rather than WebhookVerificationError
        print(f"Vern webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # The body carries no event name: workbook.production.export and workbook.preview.export deliver
    # the same payload, and `version` is the export mode ("1.0" flat, "2.0" nested), not the event.
    # Register separate endpoints for preview and production to tell them apart.
    # `svix-id` is stable across retries of the same message: use it to deduplicate.
    # Batches can arrive in any order: group by batch.id, order by batch.index.
    batch = event.get("batch")
    if not isinstance(batch, dict):
        batch = {}
    version = event.get("version")
    print(f"Received Vern webhook {msg_id}: version {version}, batch {batch['index'] + 1 if isinstance(batch.get('index'), int) else '?'}/{batch.get('total', '?')}")

    records = None
    if version == "1.0":
        # Flat: sheets[].data is a list of row objects (column keys + errors + row_index)
        sheets = event.get("sheets") or []
        records = sum(len(sheet.get("data") or []) for sheet in sheets)
        for sheet in sheets:
            print(f"Sheet {sheet.get('name')}: rows {sheet.get('start_row_index')}-{sheet.get('end_row_index')}")
    elif version == "2.0":
        # Nested: data is keyed by root sheet name; each record has a `children` object
        root_sheets = event.get("root_sheets") or []
        data = event.get("data") or {}
        records = sum(len(data.get(name) or []) for name in root_sheets)
        print(f"Root sheets: {', '.join(root_sheets)}")
    else:
        # Return 2xx for payload versions you don't handle, or Svix keeps retrying them
        print(f"Unhandled payload version: {version}")

    return {
        "success": True,
        "version": version,
        "batch_id": batch.get("id"),
        "batch_index": batch.get("index"),
        "last": batch.get("index") == (batch.get("total") or 0) - 1,
        "records": records,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
