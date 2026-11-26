# Generated with: cronofy-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI(title="Cronofy Webhooks Example")

CRONOFY_CLIENT_SECRET = os.environ.get("CRONOFY_CLIENT_SECRET", "")
CRONOFY_DATA_CENTER_URL = os.environ.get("CRONOFY_DATA_CENTER_URL", "https://api.cronofy.com")


def verify_cronofy_webhook(
    raw_body: bytes,
    hmac_header: Optional[str],
    client_secret: Optional[str],
) -> bool:
    """Verify a Cronofy push notification.

    Cronofy computes HMAC-SHA256 over the RAW request body, keyed with your
    application's OAuth client secret (prefixed ``CRN_``), base64-encoded. There is
    no separate webhook signing secret.

    The ``Cronofy-HMAC-SHA256`` header is a COMMA-SEPARATED LIST of digests -- one
    per active client secret, because Cronofy supports secret rotation. The delivery
    is authentic if ANY element matches. Comparing the whole header string works
    until a rotation starts, then rejects everything.

    Nothing else is signed: no timestamp, no nonce, no channel id, no URL, no method.
    """
    if not hmac_header or not client_secret:
        return False

    expected = base64.b64encode(
        hmac.new(client_secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    )

    # Compare as BYTES, not str: hmac.compare_digest refuses str arguments that
    # contain non-ASCII characters (it raises TypeError). Header values reach us
    # latin-1 decoded, so a hostile sender could otherwise turn a bad signature
    # into an unhandled 500 instead of a clean rejection.
    #
    # A list comprehension, not a generator: any() would short-circuit on a
    # generator, making the position of a match observable via timing.
    return any(
        [
            hmac.compare_digest(candidate.strip().encode("utf-8", "replace"), expected)
            for candidate in hmac_header.split(",")
        ]
    )


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/webhooks/cronofy")
async def cronofy_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    # FastAPI maps `cronofy_hmac_sha256` to the `Cronofy-HMAC-SHA256` header
    # (header lookup is case-insensitive).
    cronofy_hmac_sha256: Optional[str] = Header(default=None),
) -> Dict[str, bool]:
    # Read the raw bytes. The HMAC covers exactly what Cronofy sent, so the body
    # must not be parsed (or re-serialized) before verification.
    raw_body = await request.body()

    if not cronofy_hmac_sha256:
        print("Missing Cronofy-HMAC-SHA256 header")
        raise HTTPException(status_code=400, detail="Missing signature header")

    # 1. Verify BEFORE parsing. The HMAC header is the only credential Cronofy sends.
    if not verify_cronofy_webhook(raw_body, cronofy_hmac_sha256, CRONOFY_CLIENT_SECRET):
        print("Cronofy webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 2. Parse only after the signature checks out.
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    notification = payload.get("notification") or {}
    channel = payload.get("channel") or {}
    notification_type = notification.get("type")

    if not notification_type or not isinstance(notification_type, str):
        raise HTTPException(status_code=400, detail="Missing notification.type")

    print(
        f"✓ Verified Cronofy notification: {notification_type} "
        f"(channel={channel.get('channel_id')})"
    )

    # 3. Acknowledge immediately. Cronofy requires a 2xx within 5 SECONDS. Failed
    #    deliveries are retried for 24 hours and then the CHANNEL IS CLOSED
    #    automatically -- a slow handler doesn't drop one event, it kills the channel.
    #
    #    Cronofy has no replay protection (only the body is signed), so handling must
    #    be idempotent -- upsert the downstream Read Events sync on event_uid.
    background_tasks.add_task(handle_notification, notification_type, notification, channel)

    return {"received": True}


def handle_notification(
    notification_type: str,
    notification: Dict[str, Any],
    channel: Dict[str, Any],
) -> None:
    """Dispatch on `notification.type` -- a BODY field.

    Cronofy sends no event-type header.
    """
    channel_id = channel.get("channel_id")

    if notification_type == "verification":
        # Sent right after a channel is created to test the callback URL. There is
        # NO token to echo and NO challenge to reflect -- a 2xx is the entire
        # handshake, and we already sent it.
        print(f"🔍 Channel {channel_id} verified: {channel.get('callback_url')}")

    elif notification_type == "change":
        # THIN NOTIFICATION: the payload does NOT contain the changed events.
        handle_change(notification.get("changes_since"), channel)

    elif notification_type == "profile_disconnected":
        # Fires when Cronofy NEXT tries to access the profile, not at the moment the
        # user revoked access. State: UserInfo ["cronofy.data"]["profiles"].
        print(f"🔌 Calendar profile disconnected (channel={channel_id})")
        # Your code: prompt the user to reauthorize; pause syncs for that profile.

    elif notification_type == "conferencing_profile_disconnected":
        # State: UserInfo ["cronofy.data"]["conferencing_profiles"].
        print(f"🎥 Conferencing profile disconnected (channel={channel_id})")
        # Your code: prompt reconnect before creating meetings with conferencing.

    elif notification_type == "profile_initial_sync_completed":
        # NOT sent if the initial sync completed before this channel existed.
        print(f"✅ Initial calendar sync completed (channel={channel_id})")
        # Your code: run a full read now that the calendar data is complete.

    elif notification_type == "gdpr_requested":
        # The account invoked their right to be forgotten.
        print(f"🗑️  GDPR erasure requested (channel={channel_id})")
        # Your code: delete this account's data on your side.

    else:
        # Cronofy: "your code should be tolerant of others, by ignoring them, so if
        # more are introduced in future your integration will not fail."
        # We already returned 200 -- just log and move on.
        print(f'❓ Unhandled Cronofy notification type "{notification_type}"')


def handle_change(changes_since: Optional[str], channel: Dict[str, Any]) -> None:
    """Fetch what actually changed.

    ``changes_since`` goes straight into Read Events as ``last_modified``. The call
    MUST hit the same data centre the account belongs to (api.cronofy.com,
    api-uk.cronofy.com, api-de.cronofy.com, api-au.cronofy.com, api-ca.cronofy.com,
    api-sg.cronofy.com).

    Cronofy does NOT send notifications for changes caused by your own API calls, so
    don't wait for an echo of your own writes.
    """
    if not changes_since:
        print("change notification without changes_since -- skipping delta read")
        return

    calendar_ids = (channel.get("filters") or {}).get("calendar_ids")

    print(f"📅 Changes since {changes_since}")
    if calendar_ids:
        print(f"   restricted to calendars: {', '.join(calendar_ids)}")

    # Your code: replace with a real, authenticated, paginated read:
    #
    #   async with httpx.AsyncClient() as client:
    #       response = await client.get(
    #           f"{CRONOFY_DATA_CENTER_URL}/v1/events",
    #           params={"tzid": "Etc/UTC", "last_modified": changes_since},
    #           headers={"Authorization": f"Bearer {access_token}"},
    #       )
    #   # then follow pages.next_page until exhausted, upserting on event_uid
    print(
        f"   would GET {CRONOFY_DATA_CENTER_URL}/v1/events"
        f"?tzid=Etc/UTC&last_modified={changes_since}"
    )


if __name__ == "__main__":
    import uvicorn

    if not CRONOFY_CLIENT_SECRET:
        print("⚠️  Warning: CRONOFY_CLIENT_SECRET not set")

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
