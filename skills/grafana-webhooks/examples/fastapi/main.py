# Generated with: grafana-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Grafana Alerting webhook contact point receiver.

Grafana signs with HMAC-SHA256 and writes a BARE lowercase hex digest into a
user-configurable header (default: X-Grafana-Alerting-Signature). There is no
``sha256=`` prefix and no ``t=...,v1=...`` structure.

What is signed depends on whether the contact point has a Timestamp Header:

    timestamp header UNSET : HMAC(raw_body)
    timestamp header SET   : HMAC(timestamp + ":" + raw_body)   <- COLON, seconds

Mirrors ``HMACRoundTripper.sign`` in grafana/alerting ``http/hmac.go``::

    hash := hmac.New(sha256.New, []byte(rt.secret))
    if rt.timestampHeader != "" {
        timestamp := strconv.FormatInt(rt.clk.Now().Unix(), 10)
        req.Header.Set(rt.timestampHeader, timestamp)
        hash.Write([]byte(timestamp))
        hash.Write([]byte(":"))
    }
    hash.Write(body)
    signature := hex.EncodeToString(hash.Sum(nil))
    req.Header.Set(rt.header, signature)

The secret is used AS-IS as UTF-8 bytes: not base64-decoded, no prefix, and not a
Grafana API key or service-account token.

Grafana sends NO event-type header and NO delivery id. Each request is one
notification for an alert GROUP; dispatch on ``status`` / ``state`` /
``alerts[].status``.

Grafana publishes no receiver SDK for webhook verification, so this is a manual
implementation -- the same algorithm the Node examples in this skill use.

Covers the Grafana Alerting webhook contact point (Grafana-managed alerting, the
only alerting system in Grafana 11+, and Grafana Cloud). NOT Grafana legacy
dashboard alerting (removed in Grafana 11, different payload, no HMAC), NOT
Grafana OnCall / IRM outgoing webhooks, and NOT Prometheus Alertmanager.
"""

import hashlib
import hmac
import json
import logging
import os
import time
from typing import Any, Mapping, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, status

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("grafana-webhooks")

app = FastAPI(title="Grafana Webhooks")

# Documented default for the contact point's HMAC "Header" field (constant
# `defaultHeaderName` in grafana/alerting http/hmac.go, and the UI placeholder).
DEFAULT_SIGNATURE_HEADER = "X-Grafana-Alerting-Signature"


def get_config() -> dict[str, Any]:
    """Read header names and the replay window from the environment.

    Both header names are configured on the Grafana contact point, so they come
    from config rather than being hard-coded. The signature header has a
    documented default; the timestamp header has NONE -- leaving it empty means
    Grafana signs the body alone.
    """
    timestamp_header = os.environ.get("GRAFANA_TIMESTAMP_HEADER", "").strip()
    return {
        "signature_header": (
            os.environ.get("GRAFANA_SIGNATURE_HEADER") or DEFAULT_SIGNATURE_HEADER
        ).strip(),
        "timestamp_header": timestamp_header,
        # Our replay window, not Grafana's -- Grafana documents no tolerance.
        # Only meaningful when a timestamp header is configured.
        "max_age_seconds": int(os.environ.get("GRAFANA_MAX_AGE_SECONDS", "300")),
        "timestamp_required": bool(timestamp_header),
    }


def verify_grafana_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    secret: Optional[str],
    *,
    timestamp_required: bool = False,
    max_age_seconds: int = 300,
) -> bool:
    """Verify a Grafana Alerting webhook signature.

    Args:
        raw_body: RAW, unparsed request body bytes.
        signature: Value of the configured signature header.
        timestamp: Value of the configured timestamp header, or None.
        secret: Contact point HMAC secret, used as-is.
        timestamp_required: True when a Timestamp Header is configured.
        max_age_seconds: Replay window, only applied in timestamped mode.
    """
    # Fail closed: HMAC is optional in Grafana, but it is mandatory here.
    if not secret or not signature:
        return False

    if timestamp_required:
        # We're configured for timestamped signing, so a request without the
        # header cannot have been signed the way we expect. Rejecting it stops
        # an attacker from downgrading us to the weaker body-only mode.
        if not timestamp:
            return False
        try:
            ts = int(timestamp)  # UNIX SECONDS (10 digits), never milliseconds
        except (TypeError, ValueError):
            return False
        if abs(int(time.time()) - ts) > max_age_seconds:
            return False

    mac = hmac.new(secret.encode("utf-8"), digestmod=hashlib.sha256)
    if timestamp_required:
        mac.update(f"{timestamp}:".encode("utf-8"))  # COLON separator
    # Hash the RAW bytes. With the Custom Payload option the body may be
    # pretty-printed or not JSON at all, so re-serializing parsed JSON is wrong.
    mac.update(raw_body)
    expected = mac.hexdigest()  # lowercase hex, bare

    # compare_digest is constant-time and safe on differing lengths. Compare
    # BYTES: with two str arguments it raises TypeError on any non-ASCII
    # character, and header values can carry arbitrary latin-1. Lowercasing the
    # received value is harmless -- Grafana emits lowercase hex.
    received = signature.strip().lower().encode("utf-8", errors="replace")
    return hmac.compare_digest(received, expected.encode("ascii"))


def idempotency_key(payload: Mapping[str, Any]) -> str:
    """Build a heuristic idempotency key.

    Grafana sends no delivery id, so this is derived from the group identity plus
    the alert instances it carries. Repeat notifications for an unchanged group
    hash identically.
    """
    alerts = ",".join(
        sorted(
            f"{alert.get('fingerprint', '')}@{alert.get('startsAt', '')}"
            for alert in payload.get("alerts") or []
        )
    )
    return f"{payload.get('groupKey', '')}:{payload.get('status', '')}:{alerts}"


@app.post("/webhooks/grafana")
async def grafana_webhook(request: Request) -> Response:
    secret = os.environ.get("GRAFANA_WEBHOOK_SECRET")
    if not secret:
        # Fail CLOSED. Never silently accept unsigned requests.
        logger.error("GRAFANA_WEBHOOK_SECRET is not set -- refusing to accept webhooks")
        return Response(
            content="Webhook secret not configured",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    config = get_config()
    signature_header = config["signature_header"]
    timestamp_header = config["timestamp_header"]

    # Read the RAW body before anything else -- these are the bytes Grafana signed.
    raw_body = await request.body()

    # Starlette header lookup is case-insensitive.
    signature = request.headers.get(signature_header)
    if not signature:
        return Response(
            content=f"Missing {signature_header} header",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    timestamp = request.headers.get(timestamp_header) if timestamp_header else None

    if not verify_grafana_signature(
        raw_body,
        signature,
        timestamp,
        secret,
        timestamp_required=config["timestamp_required"],
        max_age_seconds=config["max_age_seconds"],
    ):
        logger.error("Grafana webhook signature verification failed")
        return Response(
            content="Invalid signature", status_code=status.HTTP_400_BAD_REQUEST
        )

    # Parse only AFTER verification.
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        # A Custom Payload template can render non-JSON. If you use one, handle
        # the body in whatever format your template emits instead.
        return Response(
            content="Invalid JSON body", status_code=status.HTTP_400_BAD_REQUEST
        )

    logger.info(
        'Notification from contact point "%s" (status=%s, state=%s, key=%s)',
        payload.get("receiver"),
        payload.get("status"),
        payload.get("state"),
        idempotency_key(payload),
    )

    if payload.get("truncatedAlerts"):
        logger.warning(
            "%s alert(s) truncated by Max Alerts", payload["truncatedAlerts"]
        )

    # There are NO event types. Dispatch on the group status...
    group_status = payload.get("status")
    if group_status == "firing":
        logger.info("FIRING: %s", payload.get("title"))
        # TODO: open an incident, page on-call, create a ticket
    elif group_status == "resolved":
        logger.info("RESOLVED: %s", payload.get("title"))
        # TODO: close the incident, post an all-clear
    else:
        logger.info("Unknown group status: %s", group_status)

    # ...and on each alert, because a `firing` GROUP can contain `resolved` alerts
    # (the group is firing if ANY member is firing).
    for alert in payload.get("alerts") or []:
        name = (alert.get("labels") or {}).get("alertname", "(unnamed)")
        if alert.get("status") == "firing":
            summary = (alert.get("annotations") or {}).get("summary", "")
            logger.info("  firing:   %s -- %s", name, summary)
        elif alert.get("status") == "resolved":
            logger.info("  resolved: %s (ended %s)", name, alert.get("endsAt"))

    # Grafana treats any 2xx as success.
    return Response(content="OK", status_code=status.HTTP_200_OK)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
