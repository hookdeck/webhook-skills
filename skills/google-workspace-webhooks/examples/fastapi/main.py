# Generated with: google-workspace-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Annotated, Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()


def verify_channel_token(received: Optional[str], expected: Optional[str]) -> bool:
    """Verify the channel token on a Google Workspace push notification.

    Google does NOT sign push notifications. The `token` you set in the watch
    request (max 256 chars) is echoed back in the X-Goog-Channel-Token header of
    every notification for that channel. Compare it in constant time.
    """
    if not received or not expected:
        return False
    return hmac.compare_digest(received.encode(), expected.encode())


@dataclass
class GoogleWorkspaceNotification:
    channel_id: str
    resource_id: str
    resource_state: str
    message_number: int
    resource_uri: Optional[str] = None
    channel_expiration: Optional[str] = None
    changed: list[str] = field(default_factory=list)
    # Admin SDK Directory only: {kind, id, etag, primaryEmail}
    body: Optional[dict[str, Any]] = None


def verified_notification(
    x_goog_channel_id: Annotated[Optional[str], Header()] = None,
    x_goog_resource_id: Annotated[Optional[str], Header()] = None,
    x_goog_resource_state: Annotated[Optional[str], Header()] = None,
    x_goog_message_number: Annotated[Optional[str], Header()] = None,
    x_goog_channel_token: Annotated[Optional[str], Header()] = None,
    x_goog_resource_uri: Annotated[Optional[str], Header()] = None,
    x_goog_channel_expiration: Annotated[Optional[str], Header()] = None,
    x_goog_changed: Annotated[Optional[str], Header()] = None,
) -> GoogleWorkspaceNotification:
    """FastAPI dependency: validate X-Goog-* headers and the channel token."""
    expected = os.environ.get("GOOGLE_WORKSPACE_CHANNEL_TOKEN")
    if not expected:
        logger.error("GOOGLE_WORKSPACE_CHANNEL_TOKEN is not set")
        raise HTTPException(status_code=500, detail="Server misconfigured")

    if not (
        x_goog_channel_id
        and x_goog_resource_id
        and x_goog_resource_state
        and x_goog_message_number
    ):
        raise HTTPException(status_code=400, detail="Missing X-Goog-* headers")

    # X-Goog-Channel-Token is only present if you set `token` in the watch request.
    if not verify_channel_token(x_goog_channel_token, expected):
        logger.error("Invalid channel token for channel %s", x_goog_channel_id)
        raise HTTPException(status_code=400, detail="Invalid channel token")

    try:
        message_number = int(x_goog_message_number)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid X-Goog-Message-Number")

    return GoogleWorkspaceNotification(
        channel_id=x_goog_channel_id,
        resource_id=x_goog_resource_id,
        resource_state=x_goog_resource_state,
        message_number=message_number,
        resource_uri=x_goog_resource_uri,
        channel_expiration=x_goog_channel_expiration,
        # Comma-separated list, e.g. "content,permissions" (Drive update only)
        changed=[s.strip() for s in (x_goog_changed or "").split(",") if s.strip()],
    )


@app.post("/webhooks/google-workspace")
async def google_workspace_webhook(
    request: Request,
    notification: Annotated[GoogleWorkspaceNotification, Depends(verified_notification)],
):
    # Drive and Calendar notifications have an empty body; Admin SDK Directory
    # notifications carry a small JSON body.
    raw = await request.body()
    if raw:
        try:
            notification.body = json.loads(raw)
        except ValueError:
            notification.body = None

    handle_notification(notification)

    # Google treats 200, 201, 202, 204 and 102 as success. Respond fast and
    # fetch the actual change (files.get, changes.list, events.list) async.
    return Response(status_code=200)


def handle_notification(n: GoogleWorkspaceNotification) -> None:
    """Dispatch on X-Goog-Resource-State.

    Notifications only say *that* something changed; call the API to find out
    *what* changed.
    """
    logger.info(
        "Google Workspace notification: state=%s channel=%s message=%s",
        n.resource_state,
        n.channel_id,
        n.message_number,
    )
    state = n.resource_state

    # All APIs: first message on a new channel (message number is always 1)
    if state == "sync":
        logger.info("Channel %s is active for resource %s", n.channel_id, n.resource_id)

    # Drive files.watch (add/update are also Admin SDK Directory user events)
    elif state == "add":
        logger.info("Resource created or shared: %s", n.resource_uri)
    elif state == "update":
        logger.info("Resource updated (%s)", ", ".join(n.changed) or "unspecified")
    elif state == "remove":
        logger.info("Resource deleted or unshared: %s", n.resource_uri)
    elif state == "trash":
        logger.info("Resource moved to trash: %s", n.resource_uri)
    elif state == "untrash":
        logger.info("Resource restored from trash: %s", n.resource_uri)

    # Drive changes.watch (Google's example header shows "changed")
    elif state in ("change", "changed"):
        logger.info("Changelog items added; call changes.list with your saved page token")

    # Calendar (events, ACLs, calendar lists, settings)
    elif state == "exists":
        logger.info("Calendar resource changed: %s; run an incremental sync", n.resource_uri)
    elif state == "not_exists":
        logger.info("Calendar resource no longer exists: %s", n.resource_uri)

    # Admin SDK Directory users.watch
    elif state in ("delete", "undelete", "makeAdmin"):
        email = (n.body or {}).get("primaryEmail")
        logger.info("Directory user %s: %s", state, email)

    else:
        # Google may add new states; ignore unknown ones gracefully
        logger.info("Unhandled resource state: %s", state)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
