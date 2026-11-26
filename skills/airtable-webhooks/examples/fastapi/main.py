# Generated with: airtable-webhooks skill
# https://github.com/hookdeck/webhook-skills
import os
import json
import hmac
import hashlib
import base64
import asyncio

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, HTTPException

load_dotenv()

app = FastAPI()

mac_secret_base64 = os.environ.get("AIRTABLE_MAC_SECRET_BASE64", "")


def verify_airtable_signature(raw_body: bytes, mac_header: str, mac_secret_base64: str) -> bool:
    """Verify an Airtable webhook notification signature.

    Airtable signs the raw body with HMAC-SHA256 keyed on the base64-DECODED
    macSecretBase64 (returned once at webhook creation). The header value is
    "hmac-sha256=" + hex(digest).
    """
    if not mac_header:
        return False
    key = base64.b64decode(mac_secret_base64)
    expected = "hmac-sha256=" + hmac.new(key, raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(mac_header, expected)


def summarize_changes(payload: dict) -> dict:
    """Summarize one payload from the payloads API into per-table counts. Pure function."""
    tables = {}
    for table_id, change in (payload.get("changedTablesById") or {}).items():
        tables[table_id] = {
            "created": len(change.get("createdRecordsById") or {}),
            "changed": len(change.get("changedRecordsById") or {}),
            "destroyed": len(change.get("destroyedRecordIds") or []),
        }
    return {
        "transactionNumber": payload.get("baseTransactionNumber"),
        "source": (payload.get("actionMetadata") or {}).get("source"),
        "tables": tables,
    }


async def fetch_payloads(base_id: str, webhook_id: str, cursor: int | None = None) -> dict:
    """Fetch changes from the webhook payloads API, paging until mightHaveMore is false.

    Called AFTER acknowledging the notification. Persist the returned cursor.
    """
    token = os.environ.get("AIRTABLE_PERSONAL_ACCESS_TOKEN")
    url = f"https://api.airtable.com/v0/bases/{base_id}/webhooks/{webhook_id}/payloads"
    payloads: list[dict] = []
    next_cursor = cursor

    async with httpx.AsyncClient() as client:
        while True:
            params = {"limit": 50}  # max allowed
            if next_cursor is not None:
                params["cursor"] = next_cursor

            res = await client.get(
                url, params=params, headers={"Authorization": f"Bearer {token}"}
            )
            if res.status_code == 429:
                # Shares the base's 5 req/s limit — back off and retry the same cursor.
                await asyncio.sleep(30)
                continue
            res.raise_for_status()

            data = res.json()
            payloads.extend(data.get("payloads", []))
            next_cursor = data.get("cursor")
            if not data.get("mightHaveMore"):
                break

    return {"payloads": payloads, "cursor": next_cursor}


@app.post("/webhooks/airtable")
async def airtable_webhook(request: Request):
    # Read the RAW body for signature verification — do not parse before verifying.
    raw_body = await request.body()
    mac_header = request.headers.get("x-airtable-content-mac")

    if not verify_airtable_signature(raw_body, mac_header, mac_secret_base64):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Thin ping: only base.id, webhook.id, timestamp — no change data.
    ping = json.loads(raw_body)
    base_id = ping.get("base", {}).get("id")
    webhook_id = ping.get("webhook", {}).get("id")
    print(f"Airtable notification for base={base_id} webhook={webhook_id}")

    # In production, fetch payloads in a background task/queue so you always ACK within
    # 25s. Persist the returned cursor between notifications.
    if os.environ.get("AIRTABLE_PERSONAL_ACCESS_TOKEN"):
        try:
            result = await fetch_payloads(base_id, webhook_id)  # pass a persisted cursor
            for payload in result["payloads"]:
                print("Changes:", json.dumps(summarize_changes(payload)))
                # Your code: dispatch on summary["tables"] / payload["actionMetadata"]["source"]
        except Exception as err:  # noqa: BLE001
            print(f"Failed to fetch payloads: {err}")

    # Acknowledge with an empty body (200/204 within 25s).
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
