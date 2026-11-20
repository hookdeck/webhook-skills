# Generated with: roblox-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Roblox webhook notification receiver for FastAPI.

Roblox sends a `roblox-signature` header:

    roblox-signature: t=<unix seconds>,v1=<signature>

v1 = base64(HMAC-SHA256(key=webhook secret, message="<t>.<raw body>"))

The timestamp is part of the signed message, so it can't be altered without
breaking the HMAC. If the webhook has no secret in the Creator Dashboard, Roblox
sends only `t=<timestamp>`: there is nothing to authenticate, so we reject it.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request

load_dotenv()

logger = logging.getLogger("roblox-webhooks")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Roblox Webhook Handler")

# Roblox's runnable sample uses a 300 s window; its prose suggests up to 10 minutes.
DEFAULT_TOLERANCE_SECONDS = 300


def tolerance_seconds() -> int:
    try:
        value = int(os.environ.get("ROBLOX_WEBHOOK_TOLERANCE_SECONDS", ""))
    except ValueError:
        return DEFAULT_TOLERANCE_SECONDS
    return value if value > 0 else DEFAULT_TOLERANCE_SECONDS


def parse_roblox_signature_header(header: Optional[str]) -> Dict[str, Any]:
    """Parse `t=...,v1=...`. Don't assume member order or count. Split on the
    FIRST `=` only, because base64 signatures end in `=` padding."""
    parsed: Dict[str, Any] = {"timestamp": None, "signatures": []}
    for member in (header or "").split(","):
        key, sep, value = member.partition("=")
        if not sep:
            continue
        key, value = key.strip(), value.strip()
        if key == "t":
            parsed["timestamp"] = value
        elif key == "v1" and value:
            parsed["signatures"].append(value)
    return parsed


def verify_roblox_signature(
    raw_body: Union[bytes, str],
    header: Optional[str],
    secret: Optional[str],
    tolerance: int = DEFAULT_TOLERANCE_SECONDS,
    now: Optional[float] = None,
) -> Dict[str, Any]:
    """Verify against the exact bytes Roblox sent (not re-serialised JSON).

    Returns {"valid": True, "timestamp": int} or {"valid": False, "reason": str}.
    """
    if not secret:
        return {"valid": False, "reason": "secret_not_configured"}
    if not header:
        return {"valid": False, "reason": "missing_header"}

    parsed = parse_roblox_signature_header(header)
    timestamp = parsed["timestamp"]
    if not timestamp or not re.fullmatch(r"[0-9]+", timestamp):
        return {"valid": False, "reason": "missing_timestamp"}
    # No v1 = webhook saved without a secret. Never "skip verification" here:
    # that's exactly what a forged request would look like.
    if not parsed["signatures"]:
        return {"valid": False, "reason": "missing_v1"}

    # t is Unix time in SECONDS.
    current = int(now if now is not None else time.time())
    if abs(current - int(timestamp)) > tolerance:
        return {"valid": False, "reason": "timestamp_outside_tolerance"}

    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    digest = hmac.new(secret.encode("utf-8"), f"{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    expected = base64.b64encode(digest)
    if any(hmac.compare_digest(sig.encode("utf-8"), expected) for sig in parsed["signatures"]):
        return {"valid": True, "timestamp": int(timestamp)}
    return {"valid": False, "reason": "signature_mismatch"}


def parse_event_time(value: Any) -> Optional[datetime]:
    """EventTime has 7 fractional digits ("2023-12-30T16:24:24.2118874Z").
    Trim to microseconds and spell out the UTC offset for fromisoformat."""
    if not isinstance(value, str):
        return None
    trimmed = re.sub(r"(\.\d{6})\d+", r"\1", value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(trimmed)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Acknowledge first, process later. Roblox needs a 2xx within 5 seconds and
# gives up on the URL after 5 failed attempts. BackgroundTasks runs after the
# response is sent, but in the same process: in production use a durable queue
# (SQS, Celery, Cloud Tasks...) and a database unique constraint for dedupe.
# ---------------------------------------------------------------------------

# NotificationId: "If the same NotificationId is received twice, it is considered a duplicate."
seen_notification_ids: set = set()

# Map each start place ID in GameIds to the data store entries that hold that
# user's data. Empty by default, so the example deletes nothing.
#   {111111111: {"universe_id": 222222222, "entries": [("PlayerData", "global", "Player_{user_id}")]}}
ERASURE_TARGETS: Dict[int, Dict[str, Any]] = {}


def delete_standard_data_store_entry(universe_id: int, datastore_name: str, scope: str, entry_key: str) -> None:
    """Open Cloud Data Stores API. ROBLOX_OPEN_CLOUD_API_KEY is an Open Cloud API
    key with the data stores "Delete Entry" permission: a different credential
    from the webhook secret."""
    query = urllib.parse.urlencode({"datastoreName": datastore_name, "scope": scope, "entryKey": entry_key})
    req = urllib.request.Request(
        f"https://apis.roblox.com/datastores/v1/universes/{universe_id}/standard-datastores/datastore/entries/entry?{query}",
        method="DELETE",
        headers={"x-api-key": os.environ.get("ROBLOX_OPEN_CLOUD_API_KEY", "")},
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as err:
        # 404 means there was nothing to delete, which also satisfies the request.
        if err.code != 404:
            raise


def process_erasure(notification_id: str, user_id: int, game_ids: List[int]) -> None:
    for start_place_id in game_ids:
        target = ERASURE_TARGETS.get(start_place_id)
        if not target:
            continue
        for datastore_name, scope, entry_key in target["entries"]:
            delete_standard_data_store_entry(
                target["universe_id"], datastore_name, scope, entry_key.replace("{user_id}", str(user_id))
            )
    # Record completion (who, which games, when) in your compliance log here.
    logger.info("Erasure complete for notification %s", notification_id)


def handle_notification(notification: Dict[str, Any], background_tasks: BackgroundTasks) -> str:
    """Route on EventType. Only RightToErasureRequest, SampleNotification and
    AnalyticsAlert have published wire values. Roblox doesn't publish the
    EventType strings for the Subscription, Commerce, Transaction Refunded or
    Early Harm Detection triggers, so they land in the fallback branch: log the
    EventType from a real delivery, then add a branch for it."""
    payload = notification.get("EventPayload") or {}
    event_type = notification.get("EventType")

    if event_type == "RightToErasureRequest":
        # Legal obligation: delete this user's personal data for these games.
        # GameIds are start place IDs. Queue it: never do the deletion inline.
        game_ids = payload.get("GameIds") if isinstance(payload.get("GameIds"), list) else []
        background_tasks.add_task(process_erasure, notification.get("NotificationId"), payload.get("UserId"), game_ids)
        logger.info("Right to erasure request queued for %d game(s)", len(game_ids))
        return "erasure_queued"

    if event_type == "SampleNotification":
        # Sent by the Test Response button in the Creator Dashboard.
        logger.info("Sample notification received (UserId %s)", payload.get("UserId"))
        return "sample_received"

    if event_type == "AnalyticsAlert":
        # Analytics alerts: AlertMessage is itself a JSON string.
        try:
            alert = json.loads(payload.get("AlertMessage") or "{}")
        except (TypeError, ValueError):
            alert = {}
        summary = alert.get("summary") if isinstance(alert, dict) else None
        logger.info(
            "Analytics alert for %s %s: %s", payload.get("TargetType"), payload.get("TargetId"), summary or "(no summary)"
        )
        return "alert_received"

    # Includes the Subscription, Commerce, Transaction Refunded and Early Harm
    # Detection triggers, whose wire names Roblox doesn't publish. Return 2xx so
    # Roblox doesn't retry and eventually disable the URL. For Commerce Product
    # Order Paid, also dedupe on the commerce order ID (Roblox warns that
    # duplicates are possible).
    logger.info('Unhandled EventType "%s" (EventPayload keys: %s)', event_type, ", ".join(payload.keys()))
    return "unhandled"


async def verified_notification(request: Request) -> Dict[str, Any]:
    """FastAPI dependency: verify roblox-signature over the raw body, then parse."""
    secret = os.environ.get("ROBLOX_WEBHOOK_SECRET", "")
    if not secret:
        logger.error("ROBLOX_WEBHOOK_SECRET is not set: rejecting request")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Read the raw bytes: the HMAC covers the exact body. Don't use a Pydantic body model here.
    raw_body = await request.body()
    result = verify_roblox_signature(
        raw_body, request.headers.get("roblox-signature"), secret, tolerance=tolerance_seconds()
    )
    if not result["valid"]:
        if result["reason"] == "missing_v1":
            logger.error("roblox-signature has no v1: set a secret on this webhook in the Creator Dashboard")
        raise HTTPException(status_code=401, detail={"error": "Invalid signature", "reason": result["reason"]})

    try:
        notification = json.loads(raw_body)
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(notification, dict) or not isinstance(notification.get("EventType"), str):
        raise HTTPException(status_code=400, detail="Missing EventType")
    return notification


@app.post("/webhooks/roblox")
async def roblox_webhook(
    background_tasks: BackgroundTasks,
    notification: Dict[str, Any] = Depends(verified_notification),
):
    notification_id = notification.get("NotificationId")
    event_type = notification["EventType"]

    if notification_id and notification_id in seen_notification_ids:
        return {"received": True, "duplicate": True, "notificationId": notification_id, "eventType": event_type}

    event_time = parse_event_time(notification.get("EventTime"))
    logger.info("Roblox %s %s at %s", event_type, notification_id, event_time.isoformat() if event_time else notification.get("EventTime"))

    action = handle_notification(notification, background_tasks)
    if notification_id:
        seen_notification_ids.add(notification_id)

    return {"received": True, "notificationId": notification_id, "eventType": event_type, "action": action}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
