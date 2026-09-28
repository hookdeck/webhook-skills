# Generated with: aftership-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, Optional, Tuple

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    # python-dotenv is optional; env vars can be set directly.
    pass


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AfterShip Webhook Handler")


# AfterShip signature headers, checked in this order.
#
# Every AfterShip product that sends webhooks signs the SAME way —
# base64(HMAC-SHA256(secret_as_utf8, raw_body)) — and only the header name differs:
#
#   aftership-hmac-sha256     Tracking            bare base64 digest
#   as-signature-hmac-sha256  Returns, Warranty   bare base64 digest
#   am-webhook-signature      Shipping (Postmen)  hmac-sha256=<base64 digest>
#                             and Returns for orgs created before Oct 25, 2022
#
# Nothing but the body is signed: there is no timestamp header and no replay
# window, so do NOT add a timestamp tolerance check.
SIGNATURE_HEADERS: Tuple[Tuple[str, str], ...] = (
    ("aftership-hmac-sha256", "tracking"),
    ("as-signature-hmac-sha256", "returns/warranty"),
    ("am-webhook-signature", "shipping"),
)

_PREFIX = "hmac-sha256="


def extract_signature(headers) -> Optional[Dict[str, str]]:
    """Find whichever AfterShip signature header is present.

    ``headers`` is anything with a case-insensitive ``.get`` — Starlette's
    ``request.headers`` qualifies.
    """
    for header, product in SIGNATURE_HEADERS:
        value = headers.get(header)
        if value:
            # Shipping (and legacy Returns) prefix the digest. Stripping the
            # prefix is a no-op on the two headers that send it bare.
            if value.startswith(_PREFIX):
                value = value[len(_PREFIX):]
            return {"header": header, "product": product, "signature": value}
    return None


def verify_aftership_signature(
    raw_body: bytes, headers, secret: Optional[str]
) -> Dict[str, Any]:
    """Verify an AfterShip webhook signature.

    :param raw_body: The RAW request body from ``await request.body()``. Never a
        re-serialized dict: ``json.dumps`` changes the bytes and the signature
        will not match.
    :param headers: The request headers.
    :param secret: ``AFTERSHIP_WEBHOOK_SECRET``, used as UTF-8 bytes — it is NOT
        base64-encoded and carries no prefix.
    """
    # Fail CLOSED on a missing secret. Treating "no secret" as "skip verification"
    # would accept every forged request the moment an env var goes missing.
    if not secret:
        return {"valid": False, "reason": "missing_secret"}

    found = extract_signature(headers)
    if not found:
        return {"valid": False, "reason": "missing_signature_header"}

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    ).decode()

    # Compare as bytes: compare_digest handles differing lengths without raising,
    # but raises TypeError on a str containing non-ASCII characters (which a forged
    # header can carry), so encode both sides first.
    valid = hmac.compare_digest(found["signature"].encode("utf-8"), expected.encode("utf-8"))

    return {
        "valid": valid,
        "reason": None if valid else "signature_mismatch",
        "header": found["header"],
        "product": found["product"],
    }


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/aftership")
async def handle_aftership_webhook(request: Request, background_tasks: BackgroundTasks):
    # Read the RAW body. Do not use `await request.json()` here — the signature is
    # over these exact bytes, and re-serializing a parsed dict breaks it.
    raw_body = await request.body()

    result = verify_aftership_signature(
        raw_body, request.headers, os.getenv("AFTERSHIP_WEBHOOK_SECRET")
    )

    if not result["valid"]:
        if result["reason"] == "missing_secret":
            logger.error(
                "AFTERSHIP_WEBHOOK_SECRET is not set — refusing to process webhooks"
            )
            raise HTTPException(
                status_code=500,
                detail="Server misconfigured: AFTERSHIP_WEBHOOK_SECRET is not set",
            )
        if result["reason"] == "missing_signature_header":
            logger.error("No AfterShip signature header present")
            raise HTTPException(status_code=401, detail="Missing signature header")
        logger.error("AfterShip signature mismatch on %s", result.get("header"))
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only AFTER the signature is verified.
    try:
        payload = json.loads(raw_body)
    except ValueError as exc:
        logger.error("Failed to parse JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # Tracking and Returns/Warranty echo the payload version their webhook URL was
    # configured with. Fields change between versions (2026-01 renamed
    # checkpoint.zip to checkpoint.postal_code), so log it.
    version = request.headers.get("as-webhook-version")
    logger.info(
        "✓ Verified AfterShip webhook (%s, %s%s)",
        result["product"],
        result["header"],
        f", version {version}" if version else "",
    )

    # Process in the background and return 200 immediately. A non-2xx triggers up to
    # 14 retries with 2^retry x 30s backoff (~68 hours). Deliveries are at-least-once
    # — de-duplicate on event_id (Tracking) or id (Returns/Warranty).
    background_tasks.add_task(handle_webhook, payload)

    return JSONResponse(status_code=200, content={"received": True})


def handle_webhook(payload: Dict[str, Any]) -> None:
    """Route to the right product handler.

    Shipping puts the event name in ``event_type``; Tracking, Returns and Warranty
    all use ``event``. Returns and Warranty events are dotted and namespaced.
    """
    try:
        if isinstance(payload.get("event_type"), str):
            return handle_shipping_event(payload)

        event = payload.get("event")
        if not isinstance(event, str):
            logger.info("❓ AfterShip payload with no recognisable event field")
            return

        if event.startswith("return."):
            return handle_returns_event(payload)
        if event.startswith("warranty."):
            return handle_warranty_event(payload)
        return handle_tracking_event(payload)
    except Exception:  # noqa: BLE001
        # The 200 has already been sent; never let a handler error escape.
        logger.exception("Error handling AfterShip webhook")


def handle_tracking_event(payload: Dict[str, Any]) -> None:
    """AfterShip Tracking.

    There are exactly THREE event codes. The shipment status is in ``msg.tag`` /
    ``msg.subtag``, not in ``event`` — so tracking_update dispatches on the tag.
    """
    event = payload.get("event")
    msg = payload.get("msg") or {}

    # event_id is a UUID v4, unique per event — use it as the idempotency key.
    logger.info(
        "📦 Tracking event %s (event_id=%s, ts=%s)",
        event,
        payload.get("event_id"),
        payload.get("ts"),
    )

    if event == "tracking_update":
        handle_tracking_status(msg, payload.get("is_tracking_first_tag"))

    elif event == "edd_revise":
        logger.info(
            "📅 EDD revised for %s: %s",
            msg.get("tracking_number"),
            msg.get("aftership_estimated_delivery_date") or "unknown",
        )
        # TODO: update the promised delivery date, notify the customer of a delay

    elif event == "tracking_pending_time":
        logger.info(
            "⏳ Shipment %s (%s) has been pending past the configured threshold",
            msg.get("tracking_number"),
            msg.get("slug"),
        )
        # TODO: chase the warehouse, flag the carrier

    else:
        # Forward-compatibility: acknowledge unknown events rather than failing.
        logger.info('❓ Unhandled Tracking event "%s"', event)


def handle_tracking_status(msg: Dict[str, Any], is_first_tag: Optional[bool]) -> None:
    """Dispatch a tracking_update on msg.tag — the actual delivery status."""
    where = (
        f"{msg.get('tracking_number')} ({msg.get('slug')}, "
        f"order {msg.get('order_number') or 'n/a'})"
    )
    detail = msg.get("subtag_message") or msg.get("subtag") or ""
    tag = msg.get("tag")

    if tag == "Pending":
        logger.info("🕗 Pending — no carrier scan yet for %s", where)

    elif tag == "InfoReceived":
        logger.info(
            "🧾 Info received for %s%s", where, " (first update under this tag)" if is_first_tag else ""
        )

    elif tag == "InTransit":
        logger.info("🚚 In transit: %s — %s", where, detail)

    elif tag == "OutForDelivery":
        logger.info("🛵 Out for delivery: %s", where)
        # TODO: send the "arriving today" notification

    elif tag == "AttemptFail":
        logger.info("⚠️  Delivery attempt failed for %s — %s", where, detail)
        # TODO: prompt the customer to reschedule

    elif tag == "Delivered":
        logger.info("✅ Delivered: %s", where)
        # TODO: mark the order delivered, trigger the review request

    elif tag == "AvailableForPickup":
        logger.info("🏪 Available for pickup: %s — %s", where, detail)

    elif tag == "Exception":
        logger.info("🚨 Exception on %s — %s", where, detail)
        # TODO: open a support ticket

    elif tag == "Expired":
        logger.info("🗑️  Expired (no tracking info for 30 days): %s", where)

    else:
        # Treat tag values as open strings — new ones can appear.
        logger.info('❓ Unhandled tracking tag "%s" for %s', tag, where)

    checkpoints = msg.get("checkpoints") or []
    if checkpoints:
        latest = checkpoints[-1]
        logger.info(
            "   latest checkpoint: %s — %s",
            latest.get("checkpoint_time"),
            latest.get("message"),
        )


def handle_shipping_event(payload: Dict[str, Any]) -> None:
    """AfterShip Shipping (formerly Postmen).

    Events report that an async API call finished; ``meta`` is the standard API
    envelope, ``data`` the API response data.
    """
    event_type = payload.get("event_type")
    meta = payload.get("meta") or {}
    data = payload.get("data") or {}

    logger.info(
        "🚢 Shipping event %s at %s (meta.code=%s)",
        event_type,
        payload.get("date_time"),
        meta.get("code"),
    )

    # A non-200 meta.code means the underlying operation FAILED — `data` is not a
    # success payload in that case.
    if meta.get("code") and meta.get("code") != 200:
        logger.error(
            "   operation failed: %s %s", meta.get("message"), meta.get("details") or []
        )
        return

    if event_type == "calculate_rates":
        logger.info("   rates ready: %d option(s)", len(data.get("rates") or []))

    elif event_type == "create_a_label":
        label_url = ((data.get("files") or {}).get("label") or {}).get("url")
        logger.info("   label %s created — %s", data.get("id"), label_url or "no file URL")
        # TODO: store the label URL against the order

    elif event_type == "cancel_a_label":
        logger.info("   label cancellation %s: %s", data.get("id"), data.get("status"))

    elif event_type == "manifest_a_label":
        logger.info("   manifest %s: %s", data.get("id"), data.get("status"))

    else:
        logger.info('❓ Unhandled Shipping event "%s"', event_type)


def handle_returns_event(payload: Dict[str, Any]) -> None:
    """AfterShip Returns.

    Envelope: id, version, event, created_at, modified, data. ``modified`` is an
    event-specific diff; ``data`` is the full return snapshot.
    """
    event = payload.get("event")
    data = payload.get("data") or {}

    # `id` is unique per event — use it as the idempotency key.
    logger.info(
        "↩️  Returns event %s (id=%s, version=%s, created_at=%s)",
        event,
        payload.get("id"),
        payload.get("version"),
        payload.get("created_at"),
    )
    rma = data.get("rma_number") or data.get("id")

    if event == "return.submitted":
        logger.info("   return %s submitted", rma)

    elif event == "return.approved":
        logger.info(
            "   return %s approved (approval_status=%s)", rma, data.get("approval_status")
        )
        # TODO: issue the return label, notify the shopper

    elif event == "return.rejected":
        logger.info("   return %s rejected", rma)

    elif event == "return.resolved":
        logger.info("   return %s resolved", rma)
        # TODO: reconcile the refund / exchange / store credit

    elif event == "return.expired":
        logger.info("   return %s expired", rma)

    elif event in (
        "return.dropoff.created",
        "return.dropoff.updated",
        "return.dropoff.shipment.updated",
    ):
        logger.info("   dropoff update on %s (%s)", rma, event)

    elif event == "return.restock.created":
        logger.info("   restock recorded for %s", rma)

    elif event in (
        "return.shipment.provided",
        "return.shipments.provided",
        "return.shipment.recorded",
        "return.shipment.updated",
    ):
        logger.info("   shipment update on %s (%s)", rma, event)

    elif event == "return.exchange.order.created":
        logger.info("   exchange order created for %s", rma)

    elif event == "return.receiving.created":
        logger.info("   items received for %s", rma)

    else:
        # AfterShip's docs say to treat enum values as open strings.
        logger.info('❓ Unhandled Returns event "%s"', event)

    if payload.get("modified"):
        logger.info("   modified: %s", json.dumps(payload["modified"]))


def handle_warranty_event(payload: Dict[str, Any]) -> None:
    """AfterShip Warranty — same header as Returns, but its own envelope.

    Envelope: id, event, version, created_at, ``data.warranty`` (the claim
    reference) and ``current_context`` (the full claim resource). There is no
    ``modified`` field.
    """
    event = payload.get("event")
    data = payload.get("data") or {}
    claim = payload.get("current_context") or {}
    claim_id = (data.get("warranty") or {}).get("id") or claim.get("id") or "unknown"
    logger.info("🛡️  Warranty event %s (id=%s)", event, payload.get("id"))

    if event in (
        "warranty.created",
        "warranty.approved",
        "warranty.processing",
        "warranty.completed",
        "warranty.canceled",
        "warranty.rejected",
    ):
        logger.info("   claim %s → %s", claim_id, event.split(".")[1])

    elif event in (
        "warranty.inbound_shipment.provided",
        "warranty.inbound_shipment.updated",
        "warranty.outbound_shipment.provided",
        "warranty.outbound_shipment.updated",
    ):
        logger.info(
            "   shipment update on claim %s (%s)", claim_id, event
        )

    elif event == "warranty.item_received":
        logger.info("   item received for claim %s", claim_id)

    else:
        logger.info('❓ Unhandled Warranty event "%s"', event)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    logger.info("AfterShip webhook server starting on port %s", port)
    logger.info("Webhook endpoint: POST http://localhost:%s/webhooks/aftership", port)
    if not os.getenv("AFTERSHIP_WEBHOOK_SECRET"):
        logger.warning(
            "⚠️  AFTERSHIP_WEBHOOK_SECRET is not set — webhooks will be rejected with 500"
        )
    uvicorn.run(app, host="0.0.0.0", port=port)
