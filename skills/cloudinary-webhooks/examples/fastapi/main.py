# Generated with: cloudinary-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os

import cloudinary
from cloudinary.utils import verify_notification_signature
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI(title="Cloudinary Webhook Handler")

# Cloudinary signs each notification with your ACCOUNT API Secret and sends two
# headers:
#   x-cld-signature  -> hex digest of <algorithm>(rawBody + timestamp + api_secret)
#   x-cld-timestamp  -> unix timestamp (seconds)
# The digest algorithm is sha1 (default) or sha256 (opt-in account setting).
ALGORITHM = os.getenv("CLOUDINARY_SIGNATURE_ALGORITHM", "sha1")
cloudinary.config(
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    signature_algorithm=ALGORITHM,
)

# Common Cloudinary notification_type values (see references/overview.md).
KNOWN_EVENT_TYPES = [
    "upload",
    "eager",
    "delete",
    "rename",
    "moderation",
    "resource_tags_changed",
    "create_folder",
    "delete_folder",
]


def verify_cloudinary_signature(raw_body: str, timestamp: str, signature: str) -> bool:
    """
    Verify a Cloudinary webhook using the official SDK.

    Cloudinary signs the RAW request body concatenated with the timestamp and your
    API secret, so we must pass the exact bytes received — never json.loads then
    re-serialize before verifying. ``verify_notification_signature`` also rejects
    notifications whose timestamp is older than ``valid_for`` seconds (default
    7200 = 2 hours), guarding against replay.
    """
    if not raw_body or not timestamp or not signature:
        return False
    if not cloudinary.config().api_secret:
        return False
    return verify_notification_signature(raw_body, int(timestamp), signature)


@app.post("/webhooks/cloudinary")
async def handle_cloudinary_webhook(request: Request):
    """Handle Cloudinary notifications (upload, eager, moderation, ...)."""
    signature = request.headers.get("x-cld-signature")
    timestamp = request.headers.get("x-cld-timestamp")

    # Reject early if the signature headers are missing.
    if not signature or not timestamp:
        print("Cloudinary webhook missing x-cld-signature / x-cld-timestamp header")
        return Response(content="Missing signature headers", status_code=400)

    # Read the RAW body: Cloudinary signs the exact bytes.
    raw_body = (await request.body()).decode("utf-8")

    # Authenticate before trusting the payload.
    if not verify_cloudinary_signature(raw_body, timestamp, signature):
        print("Cloudinary webhook signature verification failed")
        return Response(content="Invalid signature", status_code=401)

    # Only parse AFTER verification succeeds.
    try:
        notification = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(content="Invalid JSON", status_code=400)

    notification_type = notification.get("notification_type")
    public_id = notification.get("public_id")
    print(f"Received Cloudinary {notification_type} (public_id {public_id})")

    # Dispatch on the notification_type.
    if notification_type == "upload":
        print(f"Asset uploaded: {public_id} {notification.get('secure_url')}")

    elif notification_type == "eager":
        print(f"Eager transformations ready: {public_id} {notification.get('eager')}")

    elif notification_type == "delete":
        print(f"Assets deleted: {notification.get('resources', public_id)}")

    elif notification_type == "rename":
        print(
            f"Asset renamed: {notification.get('from_public_id')} -> "
            f"{notification.get('to_public_id')}"
        )

    elif notification_type == "moderation":
        # A moderation result is available (manual or add-on moderation).
        print(f"Moderation result: {public_id} {notification.get('moderation_status')}")
        # TODO: Approve/reject the asset based on moderation_status.

    elif notification_type == "resource_tags_changed":
        print(f"Tags changed: {notification.get('resources')}")

    elif notification_type == "create_folder":
        print(f"Folder created: {notification.get('folder_path', notification.get('folder'))}")

    elif notification_type == "delete_folder":
        print(f"Folder deleted: {notification.get('folder_path', notification.get('folder'))}")

    else:
        # Unknown/new type: acknowledge with 200 so Cloudinary does not retry.
        print(f"Unhandled Cloudinary notification_type: {notification_type}")

    # Respond 2xx quickly. A non-2xx makes Cloudinary retry.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
