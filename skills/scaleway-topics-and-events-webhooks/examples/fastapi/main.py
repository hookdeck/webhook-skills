# Generated with: scaleway-topics-and-events-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import logging
import os
import time
from datetime import datetime
from typing import Any, Awaitable, Callable, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from scaleway_sns import (
    DEFAULT_CERT_HOSTS,
    CertFetchError,
    Verifier,
    confirm_subscription,
    fetch_certificate_pem,
    is_valid_subscribe_url,
)

load_dotenv()

logger = logging.getLogger("scaleway-topics-and-events-webhooks")


def _list(value: Optional[str]) -> List[str]:
    return [s.strip() for s in (value or "").split(",") if s.strip()]


def _max_age(value: Optional[str]) -> int:
    value = (value or "").strip()
    return int(value) if value.isascii() and value.isdigit() else 0


def create_app(
    trust_chain_pem: Optional[bytes] = None,
    allowed_cert_hosts: Optional[List[str]] = None,
    topic_arns: Optional[List[str]] = None,
    max_age_seconds: Optional[int] = None,
    fetch_cert: Callable[[str], Awaitable[bytes]] = fetch_certificate_pem,
    confirm: Callable[[str], Awaitable[bool]] = confirm_subscription,
    now: Callable[[], float] = time.time,
) -> FastAPI:
    """
    Options default to environment variables:
      SCALEWAY_SNS_TRUST_CHAIN_PATH  Scaleway's sns-trust-chain.pem, downloaded once (required)
      SCALEWAY_SNS_CERT_HOSTS        hosts SigningCertURL may use (default messaging.s3.fr-par.scw.cloud)
      SCALEWAY_SNS_TOPIC_ARNS        accept only these topics (recommended; comma-separated)
      SCALEWAY_SNS_MAX_AGE_SECONDS   opt-in replay window on the signed Timestamp (unset or 0 = off)
    """
    if trust_chain_pem is None:
        path = os.getenv("SCALEWAY_SNS_TRUST_CHAIN_PATH")
        if not path:
            raise RuntimeError("Set SCALEWAY_SNS_TRUST_CHAIN_PATH to Scaleway's sns-trust-chain.pem")
        with open(path, "rb") as f:
            trust_chain_pem = f.read()

    verifier = Verifier(
        trust_chain_pem,
        allowed_cert_hosts=allowed_cert_hosts or _list(os.getenv("SCALEWAY_SNS_CERT_HOSTS")) or DEFAULT_CERT_HOSTS,
        fetch_cert=fetch_cert,
        now=now,
    )
    allowed_topics = topic_arns if topic_arns is not None else _list(os.getenv("SCALEWAY_SNS_TOPIC_ARNS"))
    max_age = max_age_seconds if max_age_seconds is not None else _max_age(os.getenv("SCALEWAY_SNS_MAX_AGE_SECONDS"))

    app = FastAPI()

    @app.post("/webhooks/scaleway-topics-and-events")
    async def scaleway_webhook(request: Request):
        # Scaleway doesn't document the Content-Type (AWS SNS sends text/plain): read the bytes and
        # parse the JSON envelope ourselves.
        try:
            msg = json.loads(await request.body())
        except (json.JSONDecodeError, UnicodeDecodeError, RecursionError):
            return JSONResponse({"error": "Body is not a JSON envelope"}, status_code=400)
        if not isinstance(msg, dict):
            return JSONResponse({"error": "Body is not a JSON envelope"}, status_code=400)

        # 1. Verify the signature against Scaleway's CA trust chain. Route on the signed Type, not on
        #    the x-amz-sns-message-type header (which is not signed).
        try:
            ok, reason = await verifier.verify(msg)
        except CertFetchError as exc:
            logger.error("%s", exc)
            return JSONResponse({"error": "Signing certificate unavailable"}, status_code=503)
        if not ok:
            logger.error("Scaleway message rejected: %s", reason)
            return JSONResponse({"error": "Invalid signature"}, status_code=401)

        # 2. A valid signature proves Scaleway sent it, not that it came from YOUR topic: anyone can
        #    subscribe your URL to their own topic. Pin the topics you expect.
        if allowed_topics and msg["TopicArn"] not in allowed_topics:
            logger.error("Message from unexpected topic %s", msg["TopicArn"])
            return JSONResponse({"error": "Unexpected topic"}, status_code=403)

        # 3. Optional replay window (off by default: Hookdeck retries and replays resend the original
        #    envelope, Timestamp included).
        if max_age > 0 and not _fresh(msg["Timestamp"], max_age, now()):
            return JSONResponse({"error": "Message too old"}, status_code=401)

        message_type = msg["Type"]
        if message_type == "SubscriptionConfirmation":
            # Only a receiver Scaleway calls directly sees this: Hookdeck's Scaleway source confirms
            # the subscription itself and does not forward the confirmation.
            if not is_valid_subscribe_url(msg):
                return JSONResponse({"error": "Unexpected SubscribeURL"}, status_code=400)
            try:
                confirmed = await confirm(msg["SubscribeURL"])
            except Exception as exc:  # network errors, timeouts
                logger.error("Confirming the subscription failed: %s", exc)
                confirmed = False
            if not confirmed:
                return JSONResponse({"error": "Subscription confirmation failed"}, status_code=502)
            logger.info("Confirmed subscription to %s", msg["TopicArn"])
            return {"confirmed": True}

        if message_type == "Notification":
            # Standard topics deliver at least once: dedupe on MessageId.
            # Message is whatever the publisher sent (often JSON, but any string); treat it as untrusted.
            payload: Any = msg["Message"]
            try:
                payload = json.loads(msg["Message"])
            except (json.JSONDecodeError, RecursionError):
                pass  # plain-text message
            kind = "JSON object" if isinstance(payload, dict) else type(payload).__name__
            subject = msg.get("Subject")
            logger.info(
                "Notification %s from %s%s: %s",
                msg["MessageId"],
                msg["TopicArn"],
                f" (subject: {subject})" if isinstance(subject, str) else "",
                kind,
            )
            # TODO: process the message idempotently (keyed on msg["MessageId"])
            return {"received": True}

        # UnsubscribeConfirmation: an SNS message type; Scaleway's docs don't say whether it sends one.
        logger.info("Unsubscribed from %s", msg["TopicArn"])
        return {"received": True}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    return app


def _fresh(timestamp: str, max_age: int, now: float) -> bool:
    try:
        sent = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return False
    return abs(now - sent) <= max_age


# `uvicorn main:app` serves this; it fails fast when SCALEWAY_SNS_TRUST_CHAIN_PATH is not set.
app = create_app()
