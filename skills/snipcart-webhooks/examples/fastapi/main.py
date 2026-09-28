# Generated with: snipcart-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Snipcart webhook receiver (FastAPI).

SNIPCART DOES NOT SIGN WEBHOOKS.

There is no signature header, no HMAC, no shared webhook secret and no timestamp
header. Every outbound request instead carries a random token in
`X-Snipcart-RequestToken`, valid for one hour, which you prove genuine by
calling Snipcart's API with your SECRET API key:

    GET https://app.snipcart.com/api/requestvalidation/{token}
    Authorization: Basic base64(SNIPCART_SECRET_API_KEY + ":")

    200     -> genuine
    404     -> unknown, already validated, or expired
    401/403 -> your secret key is wrong, missing, or in the wrong mode

Verification is therefore a NETWORK CALL, not a local computation. It uses httpx
(already a FastAPI test dependency) so tests can inject an httpx.MockTransport;
there is no official Snipcart SDK for webhook validation.
"""

import base64
import json
import logging
import os
import re
from typing import Any, Dict, Optional

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("snipcart-webhooks")

app = FastAPI(title="Snipcart Webhooks")

VALIDATION_ENDPOINT = "https://app.snipcart.com/api/requestvalidation"

# The token is attacker-controlled and gets interpolated into the URL path of a
# request that carries the store's SECRET key. Format-check it BEFORE it reaches
# the URL. Percent-encoding is NOT enough: `.` and `..` pass through
# urllib.parse.quote unchanged and URL parsers resolve them as dot segments, so a token of `..`
# would turn the call into `GET https://app.snipcart.com/api/` -- whose 200
# would be misread as "the token is genuine". Observed tokens are UUIDs.
TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,128}$")

VALIDATION_TIMEOUT_SECONDS = float(os.environ.get("SNIPCART_VALIDATION_TIMEOUT_SECONDS", "5"))

# Test seam: tests assign an httpx.MockTransport here. None in production.
TRANSPORT: Optional[httpx.BaseTransport] = None


class SnipcartConfigurationError(Exception):
    """Raised when the secret key is missing. Never fail open -- fail loudly."""


def basic_auth_header(secret_key: str) -> str:
    """`Basic base64(key + ":")` -- the TRAILING COLON is required."""
    return "Basic " + base64.b64encode(f"{secret_key}:".encode()).decode()


async def validate_request_token(
    token: Optional[str],
    secret_key: Optional[str] = None,
    timeout: Optional[float] = None,
) -> Dict[str, Any]:
    """Validate an `X-Snipcart-RequestToken` against Snipcart's API.

    Fails closed on every uncertainty: malformed token, 404, 401/403, any other
    status, a network error or a timeout all return ``{"valid": False, ...}``.
    """
    key = secret_key if secret_key is not None else os.environ.get("SNIPCART_SECRET_API_KEY")
    if not key:
        raise SnipcartConfigurationError("SNIPCART_SECRET_API_KEY is not set")

    candidate = (token or "").strip()
    if not candidate:
        return {"valid": False, "reason": "missing_token"}
    # Reject without ever calling Snipcart with a hostile path segment.
    if not TOKEN_PATTERN.match(candidate):
        return {"valid": False, "reason": "malformed_token"}

    try:
        async with httpx.AsyncClient(
            timeout=timeout if timeout is not None else VALIDATION_TIMEOUT_SECONDS,
            # Never forward the secret key to whatever a redirect points at, and
            # only a DIRECT 200 counts as genuine.
            follow_redirects=False,
            transport=TRANSPORT,
        ) as client:
            response = await client.get(
                f"{VALIDATION_ENDPOINT}/{candidate}",
                headers={
                    "Authorization": basic_auth_header(key),
                    "Accept": "application/json",
                },
            )
    except httpx.HTTPError as exc:
        # Network error or timeout. Log the failure, never the key or the token.
        logger.error("Snipcart request validation failed to reach the API: %s", type(exc).__name__)
        return {"valid": False, "reason": "upstream_unreachable"}

    if response.status_code == 200:
        return {"valid": True, "reason": "ok", "status": 200}
    if response.status_code == 404:
        # Unknown, already validated, or expired (tokens live one hour).
        return {"valid": False, "reason": "unknown_token", "status": 404}
    if response.status_code in (401, 403):
        # Configuration problem on our side: wrong/missing secret key, or a key
        # created in the other mode (Test keys cannot read Live data).
        logger.error(
            "Snipcart rejected the validation call -- check SNIPCART_SECRET_API_KEY and its mode"
        )
        return {"valid": False, "reason": "validation_unauthorized", "status": response.status_code}
    # Anything else (5xx, 429 included) is NOT a success. Fail closed.
    logger.error("Snipcart request validation unavailable: HTTP %s. Failing closed.", response.status_code)
    return {"valid": False, "reason": "upstream_error", "status": response.status_code}


class RejectedRequest(Exception):
    """Carries the response to return when a request cannot be trusted."""

    def __init__(self, response: JSONResponse) -> None:
        self.response = response


async def verified_event(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: validate the token, then parse the raw body.

    Nothing downstream runs until Snipcart has confirmed the token.
    """
    # Header lookup is case-insensitive in Starlette; Snipcart has been seen
    # sending `X-Snipcart-Requesttoken` on the wire.
    token = request.headers.get("X-Snipcart-RequestToken")

    try:
        result = await validate_request_token(token)
    except SnipcartConfigurationError as exc:
        logger.error(str(exc))
        raise RejectedRequest(
            JSONResponse(status_code=500, content={"error": "server_misconfigured"})
        )

    if not result["valid"]:
        logger.warning("Rejected Snipcart request: %s", result["reason"])
        raise RejectedRequest(
            JSONResponse(
                status_code=401,
                content={"error": "invalid_request_token", "reason": result["reason"]},
            )
        )

    # Parse only AFTER the token checks out.
    raw = await request.body()
    try:
        event = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        raise RejectedRequest(JSONResponse(status_code=400, content={"error": "invalid_json"}))

    if not isinstance(event, dict) or not isinstance(event.get("eventName"), str):
        raise RejectedRequest(
            JSONResponse(status_code=400, content={"error": "missing_event_name"})
        )

    return event


@app.exception_handler(RejectedRequest)
async def rejected_request_handler(request: Request, exc: RejectedRequest) -> JSONResponse:
    return exc.response


# ---------------------------------------------------------------------------
# Asynchronous events: order.* and v3/subscription.*
# ---------------------------------------------------------------------------


@app.post("/webhooks/snipcart")
async def handle_webhook(event: Dict[str, Any] = Depends(verified_event)) -> JSONResponse:
    content = event.get("content") or {}

    # There is NO event id and NO delivery id in the envelope. For idempotency,
    # key on the order token + eventName (+ createdOn).
    idempotency_key = ":".join(
        [
            event["eventName"],
            str(
                content.get("token")
                or content.get("orderToken")
                or (content.get("subscription") or {}).get("id")
                or "unknown"
            ),
            str(event.get("createdOn")),
        ]
    )
    logger.info("Snipcart %s event %s (%s)", event.get("mode"), event["eventName"], idempotency_key)

    # Snipcart may add new payload fields at any time without notice. Ignore
    # unknown fields -- never apply strict schema validation.
    name = event["eventName"]
    if name == "order.completed":
        handle_order_completed(content)
    elif name == "order.status.changed":
        # `from` / `to` are TOP-LEVEL, alongside content, not inside it.
        logger.info(
            "Order %s status %s -> %s", content.get("token"), event.get("from"), event.get("to")
        )
    elif name == "order.paymentStatus.changed":
        logger.info(
            "Order %s payment %s -> %s", content.get("token"), event.get("from"), event.get("to")
        )
    elif name == "order.trackingNumber.changed":
        logger.info(
            "Order %s tracking %s (%s)",
            content.get("token"),
            event.get("trackingNumber"),
            event.get("trackingUrl"),
        )
    elif name == "order.refund.created":
        logger.info(
            "Refund of %s %s on %s",
            content.get("amount"),
            content.get("currency"),
            content.get("orderToken"),
        )
    elif name == "order.notification.created":
        logger.info(
            "Notification %s on %s", content.get("notificationType"), content.get("orderToken")
        )
    elif name == "order.withdrawal.created":
        logger.info("Withdrawal %s on order %s", content.get("id"), content.get("orderToken"))

    # The `v3/` prefix is PART OF THE EVENT NAME. Do not strip it.
    # These payment events do NOT fire for the first payment, only recurring ones.
    elif name == "v3/subscription.invoice.payment.succeeded":
        subscription = content.get("subscription") or {}
        logger.info(
            "Subscription %s paid, next %s",
            subscription.get("id"),
            subscription.get("nextBillingDate"),
        )
    elif name == "v3/subscription.invoice.payment.failed":
        logger.info("Subscription %s payment failed", (content.get("subscription") or {}).get("id"))
    elif name == "v3/subscription.state.cancellationRequested":
        logger.info(
            "Subscription %s cancellation requested",
            (content.get("subscription") or {}).get("id"),
        )
    elif name == "v3/subscription.state.cancelled":
        logger.info("Subscription %s cancelled", (content.get("subscription") or {}).get("id"))
    else:
        # New event types can appear. Acknowledge instead of erroring.
        logger.info("Unhandled Snipcart event: %s", name)

    # Snipcart requires Content-Type application/json AND status 200.
    return JSONResponse(status_code=200, content={"received": True})


def handle_order_completed(order: Dict[str, Any]) -> None:
    logger.info(
        "Order %s (%s) for %s: %s %s, %d item(s), status %s/%s",
        order.get("invoiceNumber"),
        order.get("token"),
        order.get("email"),
        order.get("finalGrandTotal", order.get("grandTotal")),
        order.get("currency"),
        len(order.get("items") or []),
        order.get("status"),
        order.get("paymentStatus"),
    )


# ---------------------------------------------------------------------------
# Synchronous webhooks: the RESPONSE BODY is consumed by Snipcart at checkout.
#
# These are configured in their own dashboard settings (Shipping -> Webhooks,
# Taxes -> Providers -> Webhooks), NOT in the general webhook URL, and they must
# point DIRECTLY at this app: a store-and-forward gateway such as Hookdeck
# cannot synchronously return a destination's response to the client.
# ---------------------------------------------------------------------------


@app.post("/webhooks/snipcart/shipping-rates")
async def handle_shipping_rates(
    event: Dict[str, Any] = Depends(verified_event),
) -> JSONResponse:
    # content is the current ORDER for shippingrates.fetch. The documented
    # shippingrates.fetch example uses FLAT address fields
    # (`shippingAddressCountry`, `shippingAddressPostalCode`, ...), unlike the
    # nested `shippingAddress` object on order events -- read both.
    order = event.get("content") or {}
    country = order.get("shippingAddressCountry") or (order.get("shippingAddress") or {}).get("country")

    if not country:
        # Customer-facing error: still a 2XX, with an `errors` array.
        return JSONResponse(
            status_code=200,
            content={
                "errors": [
                    {
                        "key": "invalid_shipping_address",
                        "message": "A shipping country is required.",
                    }
                ]
            },
        )

    # Trivial illustrative calculation -- replace with your carrier logic.
    weight = float(order.get("totalWeight") or 0)
    base = 10 if country == "US" else 25
    cost = round(base + weight * 0.01, 2)

    # `cost` and `description` are required. `userDefinedId` must be unique and
    # ends up on the order as `shippingRateUserDefinedId`.
    return JSONResponse(
        status_code=200,
        content={
            "rates": [
                {
                    "cost": cost,
                    "description": "Standard shipping",
                    "userDefinedId": "standard",
                    "guaranteedDaysToDelivery": 5,
                },
                {
                    "cost": round(cost * 2, 2),
                    "description": "Express shipping",
                    "userDefinedId": "express",
                    "guaranteedDaysToDelivery": 2,
                },
            ]
        },
    )


@app.post("/webhooks/snipcart/taxes")
async def handle_taxes(event: Dict[str, Any] = Depends(verified_event)) -> JSONResponse:
    # content is the live CART for taxes.calculate (not an order). Dates inside
    # it are Unix timestamps, not ISO strings, and `paymentMethod` is a number.
    cart = event.get("content") or {}
    taxable_base = sum(float(item.get("totalPrice") or 0) for item in (cart.get("items") or []))

    # Trivial illustrative calculation -- replace with your tax engine.
    rate = 0.05
    amount = round(taxable_base * rate, 2)

    # `name` and `amount` are required. `amount` is in CURRENCY UNITS, not cents.
    return JSONResponse(
        status_code=200,
        content={
            "taxes": [
                {
                    "name": "Sales tax",
                    "amount": amount,
                    "rate": rate,
                    "numberForInvoice": "TAX-001",
                }
            ]
        },
    )


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
