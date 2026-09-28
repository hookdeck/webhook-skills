# Generated with: checkout-com-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Checkout.com webhook receiver.

CHECKOUT.COM WEBHOOK VERIFICATION

Two INDEPENDENT, OPTIONAL mechanisms are configured per webhook (Dashboard ->
Developers -> Webhooks, or the `webhook` action on POST /workflows). Check
whichever you have a value for.

  1. Cko-Signature  (PRIMARY -- the only one that proves body integrity)
     header : Cko-Signature
     value  : HMAC-SHA256(raw body) keyed with the webhook SIGNATURE KEY,
              HEX-encoded (Base16). A BARE digest: no `sha256=` prefix, no
              `t=`/timestamp, no version tag, exactly ONE signature.
     key    : used AS-IS as a UTF-8 string. NOT base64/hex-decoded, and NOT
              your sk_... secret API key on the current platform.

  2. Authorization  (OPTIONAL -- a static shared key, NOT a signature)
     header : Authorization
     value  : the configured key VERBATIM. Checkout.com adds NO "Bearer "
              prefix. It proves the sender knows the key; it says nothing
              about whether the body was modified.

THERE IS NO TIMESTAMP. No Cko-Timestamp header exists and no timestamp is
signed, so there is nothing to build a replay window from. Do NOT add a
tolerance check -- replay protection is deduplication on the event id.

Checkout.com's official SDKs manage workflows but ship NO webhook-signature
verify helper, and there is no Python webhook SDK to reach for, so this is a
manual HMAC with hmac + hashlib by necessity.

Not Checkout Page (checkoutpage.com), not CheckoutJoy, not 2Checkout / Verifone,
not Stripe Checkout, not Shopify checkout webhooks.
"""

import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request, Response, status

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("checkout-com-webhooks")

app = FastAPI(title="Checkout.com Webhooks")


def verify_cko_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    signature_key: Optional[str],
) -> bool:
    """Verify the Cko-Signature header.

    Args:
        raw_body: RAW, unparsed request body bytes.
        signature_header: The ``Cko-Signature`` header value.
        signature_key: ``CHECKOUT_WEBHOOK_SIGNATURE_KEY``.

    Returns:
        True only when the signature matches.
    """
    # Fail closed: a missing header or an unconfigured key is a rejection.
    if not signature_header or not signature_key:
        return False

    # HMAC over the RAW BODY BYTES. Checkout.com: "perform the signature
    # calculation based on the raw payload body from the HTTP request" -- a
    # deserialize/re-serialize round trip can change number precision and mangle
    # special characters ((c), (R), (TM)), and the digest then never matches.
    expected = hmac.new(
        signature_key.encode("utf-8"),  # key AS-IS as UTF-8 -- do NOT decode it
        raw_body,
        hashlib.sha256,
    ).hexdigest()  # HEX (Base16), not base64

    # Checkout.com's own WooCommerce plugin compares lowercase hex with ===, so
    # lowercase the received value before comparing.
    #
    # compare_digest is constant-time AND tolerates unequal lengths -- unlike
    # Node's crypto.timingSafeEqual, which needs a guard. It does REQUIRE bytes
    # once a value can be non-ASCII: given str arguments it raises TypeError on
    # any character above U+007F, and Starlette decodes headers as latin-1, so a
    # junk Cko-Signature byte would turn a 401 into an unhandled 500. Encode.
    return hmac.compare_digest(
        signature_header.strip().lower().encode("utf-8"),
        expected.encode("utf-8"),
    )


def verify_authorization_key(
    header: Optional[str],
    expected_key: Optional[str],
) -> bool:
    """Verify the optional static Authorization key.

    Returns True when no key is configured -- this mechanism is opt-in per
    webhook, and Cko-Signature is what actually protects the body.
    """
    if not expected_key:
        return True  # not configured for this webhook
    # Compare the WHOLE header value -- Checkout.com sends the key verbatim,
    # with no "Bearer " / "Basic " prefix to strip. Encode both sides: the key
    # is an arbitrary UTF-8 string, and compare_digest raises TypeError on str
    # arguments containing non-ASCII characters.
    return hmac.compare_digest(
        (header or "").encode("utf-8"),
        expected_key.encode("utf-8"),
    )


def format_amount(amount: Any, currency: Optional[str]) -> str:
    """Format a Checkout.com amount for logging.

    ``amount`` is in the MINOR CURRENCY UNIT: {"amount": 20, "currency": "USD"}
    is $0.20, not $20. This assumes a two-decimal currency; zero-decimal (JPY,
    KRW) and three-decimal (BHD, KWD, TND) currencies have different exponents,
    so use the currency's real exponent if you handle more than one.
    """
    if not isinstance(amount, (int, float)) or isinstance(amount, bool):
        return "n/a"
    return f"{amount / 100:.2f} {currency or ''}".strip()


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/webhooks/checkout-com")
async def checkout_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> Response:
    """Receive a Checkout.com webhook.

    Reads the RAW body first -- ``await request.json()`` before verifying would
    leave you with a parsed object you cannot re-serialize byte for byte, and
    Checkout.com signs the exact bytes it sent.
    """
    raw_body = await request.body()

    # Starlette's Headers are case-insensitive; Checkout.com sends
    # "Cko-Signature".
    signature_header = request.headers.get("cko-signature")
    authorization_header = request.headers.get("authorization")

    signature_key = os.environ.get("CHECKOUT_WEBHOOK_SIGNATURE_KEY")
    authorization_key = os.environ.get("CHECKOUT_WEBHOOK_AUTHORIZATION_KEY")

    # FAIL CLOSED on misconfiguration. 500 (not 401) so an operator can tell
    # "my server is misconfigured" apart from "someone sent a bad signature".
    if not signature_key:
        logger.error(
            "CHECKOUT_WEBHOOK_SIGNATURE_KEY is not set -- refusing to accept "
            "unverified webhooks"
        )
        return _json_response(
            {"error": "Webhook signature key not configured"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    if not signature_header:
        # Checkout.com sends no unsigned requests once a signature key is
        # configured. There is NO handshake, NO challenge and NO special test
        # envelope -- an unsigned request is not one you should trust.
        logger.error("Missing Cko-Signature header")
        return _json_response(
            {"error": "Missing Cko-Signature header"},
            status.HTTP_401_UNAUTHORIZED,
        )

    # Check the optional static key first -- it is the cheaper test.
    if not verify_authorization_key(authorization_header, authorization_key):
        logger.error("Checkout.com webhook Authorization key mismatch")
        return _json_response(
            {"error": "Invalid Authorization key"},
            status.HTTP_401_UNAUTHORIZED,
        )

    if not verify_cko_signature(raw_body, signature_header, signature_key):
        logger.error("Checkout.com webhook signature verification failed")
        return _json_response(
            {"error": "Invalid signature"},
            status.HTTP_401_UNAUTHORIZED,
        )

    # Verified -- only now is it safe to parse.
    try:
        event = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        logger.error("Verified request had an unparseable body: %s", exc)
        return _json_response({"error": "Invalid JSON"}, status.HTTP_400_BAD_REQUEST)

    # IDEMPOTENCY KEY.
    #
    # The envelope `id` (evt_...) is all there is -- Checkout.com sends no
    # per-delivery id header. Delivery is AT-LEAST-ONCE, and because no
    # timestamp is signed, a byte-for-byte replay carries a genuinely valid
    # signature. Deduplication on this id is therefore your ONLY replay
    # protection.
    #
    # Retain processed ids for AT LEAST 31 hours: retries run 5m, 10m, 15m,
    # 30m, 1h, 4h, 12h, 12h after each previous attempt (~30 hours total). That
    # is a floor, not a ceiling -- manual resends can come later, so longer is
    # safer.
    event_id = event.get("id")

    # THE TIMESTAMP FIELD NAME VARIES BY EVENT. payment_approved and
    # dispute_received carry `created_on`; payment_captured carries `timestamp`.
    occurred_at = event.get("created_on") or event.get("timestamp")

    logger.info(
        "Verified Checkout.com webhook: %s (%s) at %s",
        event.get("type"),
        event_id,
        occurred_at,
    )

    # Acknowledge within Checkout.com's 10-second budget, then work
    # asynchronously. "Your webhook server must acknowledge every webhook it
    # receives within 10 seconds."
    background_tasks.add_task(handle_event, event)

    return _json_response({"received": True}, status.HTTP_200_OK)


def handle_event(event: Dict[str, Any]) -> None:
    """Dispatch a verified Checkout.com event."""
    # TODO: check event["id"] against your store and return early if seen.
    #   if store.has(event["id"]): return

    event_type = event.get("type")
    data = event.get("data") or {}
    amount = format_amount(data.get("amount"), data.get("currency"))

    # ORDERING IS NOT GUARANTEED. Checkout.com: "Checkout.com guarantees to
    # send webhooks at least once, but the order in which we send them may
    # vary." payment_captured CAN arrive before payment_approved. Make each
    # handler independently correct (upsert state) rather than requiring a
    # predecessor, and ignore transitions that would move an order backwards.

    # --- Gateway: payment lifecycle -----------------------------------------
    if event_type == "payment_approved":
        # data["id"] is the payment (pay_...), data["action_id"] the action.
        logger.info(
            "Payment approved: %s %s (ref %s, %s)",
            data.get("id"),
            amount,
            data.get("reference"),
            data.get("response_summary"),
        )
    elif event_type == "payment_declined":
        logger.info(
            "Payment declined: %s (%s %s)",
            data.get("id"),
            data.get("response_code"),
            data.get("response_summary"),
        )
    elif event_type == "payment_pending":
        logger.info("Payment pending: %s", data.get("id"))
    elif event_type == "payment_paid":
        # Checkout.com: "Occurs when a bank payout is completed successfully."
        logger.info("Payment paid: %s %s", data.get("id"), amount)
    elif event_type == "payment_expired":
        logger.info("APM payment expired: %s", data.get("id"))
    elif event_type == "payment_canceled":
        logger.info("Payment canceled: %s", data.get("id"))
    elif event_type == "payment_returned":
        logger.info("Payment returned: %s", data.get("id"))

    # --- Gateway: capture ---------------------------------------------------
    elif event_type == "payment_captured":
        # Fulfil here, not on payment_approved -- approval only holds the funds.
        logger.info("Payment captured: %s %s -- fulfil the order", data.get("id"), amount)
    elif event_type == "payment_capture_declined":
        logger.info("Capture declined: %s", data.get("id"))
    elif event_type == "payment_capture_pending":
        logger.info("Capture pending: %s", data.get("id"))

    # --- Gateway: refund ----------------------------------------------------
    elif event_type == "payment_refunded":
        logger.info("Payment refunded: %s %s", data.get("id"), amount)
    elif event_type == "payment_refund_declined":
        logger.info("Refund declined: %s", data.get("id"))
    elif event_type == "payment_refund_pending":
        logger.info("Refund pending: %s", data.get("id"))

    # --- Gateway: void ------------------------------------------------------
    elif event_type == "payment_voided":
        logger.info("Payment voided: %s", data.get("id"))
    elif event_type == "payment_void_declined":
        logger.info("Void declined: %s", data.get("id"))

    # --- Gateway: authorization increments ----------------------------------
    elif event_type == "payment_authorization_incremented":
        logger.info("Authorization incremented: %s to %s", data.get("id"), amount)
    elif event_type == "payment_authorization_increment_declined":
        logger.info("Authorization increment declined: %s", data.get("id"))

    # --- Gateway: card verification (zero-auth) ------------------------------
    elif event_type == "card_verified":
        logger.info("Card verified: %s", data.get("id"))
    elif event_type == "card_verification_declined":
        logger.info("Card verification declined: %s", data.get("id"))

    # --- Disputes -----------------------------------------------------------
    # For dispute events data["id"] is the DISPUTE (dsp_...) and
    # data["payment_id"] points at the payment being disputed.
    elif event_type == "dispute_received":
        logger.info(
            "Dispute received: %s on payment %s (%s) -- gather evidence",
            data.get("id"),
            data.get("payment_id"),
            amount,
        )
    elif event_type == "dispute_evidence_required":
        logger.info("Evidence required for dispute %s", data.get("id"))
    elif event_type == "dispute_evidence_submitted":
        logger.info("Evidence submitted for dispute %s", data.get("id"))
    elif event_type == "dispute_accepted":
        logger.info("Dispute accepted: %s", data.get("id"))
    elif event_type == "dispute_won":
        logger.info("Dispute won: %s", data.get("id"))
    elif event_type == "dispute_lost":
        logger.info("Dispute lost: %s", data.get("id"))
    elif event_type == "dispute_expired":
        logger.info("Dispute expired: %s", data.get("id"))
    elif event_type == "dispute_canceled":
        logger.info("Dispute canceled: %s", data.get("id"))
    elif event_type == "dispute_resolved":
        logger.info("Dispute resolved: %s", data.get("id"))

    # --- Fraud --------------------------------------------------------------
    elif event_type == "fraud_reported":
        # The payment is nested at data.payment.id (its amount is an object,
        # {currency, value}, not a minor-unit number).
        logger.info("Fraud reported on payment %s", (data.get("payment") or {}).get("id"))

    # --- Authentication (3DS) -----------------------------------------------
    elif event_type == "authentication_approved":
        # Authentication events carry no data.id: use session_id (sid_...) and
        # payment_id (pay_...).
        logger.info(
            "3DS authentication approved: %s (payment %s)",
            data.get("session_id"),
            data.get("payment_id"),
        )
    elif event_type == "authentication_failed":
        logger.info(
            "3DS authentication failed: %s (payment %s)",
            data.get("session_id"),
            data.get("payment_id"),
        )

    else:
        # 140+ event types exist across Balances, Compliance, Identities,
        # Issuing, Network tokens, Platforms, Real-Time Account Updater,
        # Reports and Settlements.
        # Log unknown types rather than guessing their shape.
        logger.info("Unhandled Checkout.com event type: %s", event_type)


def _json_response(payload: Dict[str, Any], status_code: int) -> Response:
    return Response(
        content=json.dumps(payload),
        status_code=status_code,
        media_type="application/json",
    )


if __name__ == "__main__":
    import uvicorn

    if not os.environ.get("CHECKOUT_WEBHOOK_SIGNATURE_KEY"):
        logger.warning("CHECKOUT_WEBHOOK_SIGNATURE_KEY is not set")
        logger.warning("Every delivery will be rejected until you set it")

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
