# Generated with: measureone-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison of two strings (compare_digest on bytes of equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_measureone_request(headers, secret=None, header_name=None) -> bool:
    """MeasureOne does not sign webhooks. You add a static header to
    delivery_details[].headers on each Data Request; the header name is yours to choose.
    Compare the WHOLE header value (do not strip or parse a "Bearer " prefix).
    This authenticates the sender only: it does not cover the body and gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("MEASUREONE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    header_name = header_name or os.environ.get("MEASUREONE_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_measureone_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_measureone_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook header")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    ids = f"datarequest={payload.get('datarequest_id')} individual={payload.get('individual_id')}"

    if event in ("datarequest.report_complete", "datarequest.report_available"):  # report_available is deprecated
        print(f"Report ready ({event}): {ids} report_uri={payload.get('report_uri')}")
        # TODO: fetch the report from payload["report_uri"]

    elif event == "datarequest.report_update_available":
        print(f"Report updated: {ids}")
        # TODO: re-fetch the report; datarequest.report_complete follows when it is complete

    elif event == "datarequest.report_error":
        print(f"Report error: {ids} reasons={payload.get('reason_codes')}")
        # TODO: ask the individual to provide better documents

    elif event in ("datarequest.items_available", "datarequest.items_processed"):
        print(f"Items ready ({event}): {ids}")
        # TODO: pull payload["items"]

    elif event == "datarequest.no_items":
        print(f"No items: {ids}")
        # TODO: tell the individual nothing was found

    elif event in ("datarequest.updates_available", "datarequest.acquisition_completed"):  # both deprecated
        print(f"Data request update ({event}): {ids}")

    elif event == "datarequest.refresh_failed":
        print(f"Refresh failed: {ids} reasons={payload.get('reason_codes')}")
        # TODO: ask the individual to reconnect their account

    elif event == "datasource.connected":
        print(f"Datasource connected: {ids} datasource={payload.get('datasource_id')}")

    elif event == "transaction.processed":
        print(f"Transaction processed: transaction={payload.get('transaction_id')}")

    elif event == "unprocessable.entity":
        print(f"Unprocessable item: item={payload.get('item_id')} reasons={payload.get('reason_codes')}")

    elif event in ("session.completed", "session.rejected", "session.terminated", "session.no_login"):
        # session.completed is deprecated
        print(f"Session event ({event}): {ids} session={payload.get('session_id')} reason={payload.get('reason_code')}")
        # TODO: follow up with the individual

    elif event in ("item.created", "item.processed"):
        print(f"Item event ({event}): item={payload.get('item_id')} type={payload.get('item_type')}")

    elif event == "item.unavailable":
        print(f"Item unavailable: type={payload.get('item_type')} reason={payload.get('reason_code')}")

    elif event == "individual.purged":
        print(f"Individual purged: individual={payload.get('individual_id')}")
        # TODO: delete the individual's data on your side

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/measureone", dependencies=[Depends(require_measureone_header)])
async def measureone_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling MeasureOne event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
