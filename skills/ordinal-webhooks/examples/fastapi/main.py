# Generated with: ordinal-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

# ORDINAL DOES NOT SIGN WEBHOOK DELIVERIES.
#
# There is no signature header, no signing secret, no `whsec_` key, no timestamp
# header, no HMAC and no Standard Webhooks / Svix headers. The Create webhook
# response returns only id, name, url, topics, createdAt — no secret is ever
# issued. Do NOT write an HMAC verifier: there are no inputs for one, and a
# fabricated verifier rejects 100% of genuine deliveries. There is also no
# official Ordinal Python SDK to defer to.
#
# The ONLY authentication mechanism is a STATIC custom header YOU configure on
# the webhook via its optional `headers` field ("Optional custom headers to
# include in webhook requests"). Ordinal adds those headers to every delivery.
# The header NAME is your choice — it is NOT an Ordinal-defined header.
#
# This is a shared-secret CHANNEL check, not integrity protection: the value is
# identical on every delivery, so it is only as good as TLS and secret hygiene.
# It proves the caller knows the secret, NOT that the body is unmodified.
# Rotate by PATCHing `headers` on the webhook.
#
# Because nothing is signed over the body, there is NO RAW-BODY REQUIREMENT.
# Parsing JSON before authenticating is fine here — the opposite of Stripe /
# Shopify / GitHub, where a body parser before verification breaks the HMAC.

app = FastAPI(title="Ordinal Webhook Handler")


def secret_header_name() -> str:
    """
    The header name you set in the webhook's `headers` object.

    Read at call time (not import time) so the value always reflects the running
    environment. Starlette's request.headers lookup is case-insensitive, so
    `X-Webhook-Secret` in the webhook config matches this lowercase name.
    """
    return os.getenv("ORDINAL_WEBHOOK_SECRET_HEADER", "x-webhook-secret").lower()


def verify_ordinal_secret(provided: Optional[str], expected: Optional[str]) -> bool:
    """
    Constant-time comparison of the inbound secret header.

    FAILS CLOSED: an unconfigured `expected` returns False. Never `return True`
    here — that would turn a misconfigured deploy into a fully open endpoint.

    hmac.compare_digest performs the constant-time COMPARISON; it does not compute
    an HMAC. A plain `==` short-circuits on the first differing byte and leaks the
    secret prefix through timing.
    """
    if not expected:
        return False  # fail closed on misconfiguration
    if not provided:
        return False
    # Compare BYTES, not str: hmac.compare_digest() raises TypeError on str values
    # containing non-ASCII characters, and the header is attacker-supplied.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


async def authenticate_ordinal(request: Request) -> None:
    """
    FastAPI dependency that authenticates the delivery before the handler runs.

    Raises 500 when the secret is unconfigured (so an operator can tell "my server
    is misconfigured" from "someone sent a bad secret") and 401 when the header is
    missing or wrong — an authentication failure, not a malformed request.
    """
    header = secret_header_name()
    secret = os.getenv("ORDINAL_WEBHOOK_SECRET")

    if not secret:
        print(
            "ORDINAL_WEBHOOK_SECRET is not set — refusing to accept unauthenticated "
            "webhooks. Generate one (openssl rand -hex 32) and set it on the webhook "
            'via PATCH /api/v1/webhooks/{id} with {"headers":{"X-Webhook-Secret":"<secret>"}}.'
        )
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    if not verify_ordinal_secret(request.headers.get(header), secret):
        print(f"Ordinal webhook rejected: {header} missing or mismatched")
        raise HTTPException(status_code=401, detail="Unauthorized")


def resource_key_for(event_type: Optional[str]) -> Optional[str]:
    """
    The single key inside `data` depends on the event family. Reading data["post"]
    on a comment or approval event raises KeyError — the most common Ordinal bug.
    """
    if not isinstance(event_type, str):
        return None
    if event_type.startswith("social_profile."):
        return "profile"
    if event_type in ("post.comment.created", "post.inline_comment.created"):
        return "comment"
    # Covers post.approval.* AND campaign.approval.* — both use data["approval"].
    if ".approval." in event_type:
        return "approval"
    if event_type.startswith("invite."):
        return "invite"
    if event_type.startswith("post."):
        return "post"
    return None


def extract_resource(event: Dict[str, Any]) -> Dict[str, Any]:
    """Read the resource out of the envelope regardless of family."""
    key = resource_key_for(event.get("type"))
    data = event.get("data") or {}
    value = data.get(key) if key else None
    return value if isinstance(value, dict) else {}


def idempotency_key_for(event: Dict[str, Any]) -> str:
    """
    Derive an idempotency key.

    ORDINAL SHIPS NO EVENT ID: the envelope has no top-level id and no delivery-id
    header is documented. This composite of type + the resource id inside `data` +
    `createdAt` is OUR OWN CONVENTION for dedupe, not a documented Ordinal key.
    """
    resource = extract_resource(event)
    # Approvals nest the subject; fall back through the plausible id locations.
    resource_id = (
        resource.get("id")
        or (resource.get("post") or {}).get("id")
        or (resource.get("campaign") or {}).get("id")
        or "unknown"
    )
    return f"{event.get('type')}:{resource_id}:{event.get('createdAt')}"


@app.post("/webhooks/ordinal", dependencies=[Depends(authenticate_ordinal)])
async def ordinal_webhook(request: Request) -> Dict[str, bool]:
    """
    Receive an Ordinal webhook.

    The envelope is always {"type": ..., "data": {...}, "createdAt": ...}.
    Any 2xx acknowledges receipt (docs: "Your endpoint should respond with a 2xx
    status code to acknowledge receipt").
    """
    # Safe to parse: nothing is signed over the raw bytes.
    try:
        event = await request.json()
    except Exception:
        print("Ordinal webhook rejected: body is not valid JSON")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    if not isinstance(event, dict) or not isinstance(event.get("type"), str):
        print("Ordinal webhook rejected: envelope missing a string `type`")
        raise HTTPException(status_code=400, detail="Invalid payload")

    idempotency_key = idempotency_key_for(event)
    print(f"✓ Authenticated Ordinal webhook: {event['type']} ({idempotency_key})")

    try:
        handle_event(event, idempotency_key)
    except Exception as err:  # noqa: BLE001
        # Log and still acknowledge: Ordinal documents no retry policy, so a
        # non-2xx has undefined consequences and re-delivery is not something to
        # rely on for a bug in your own handler.
        print(f"Error handling Ordinal event {idempotency_key}: {err}")

    # Ordinal documents no delivery timeout, so acknowledge fast and enqueue slow
    # work instead of doing it inline.
    return {"received": True}


def handle_event(event: Dict[str, Any], idempotency_key: str) -> None:
    """
    Dispatch on the exact event type strings.

    NOTE THE MIXED SEPARATORS: publish_failed, reconnect_needed,
    permanently_deleted and inline_comment use UNDERSCORES inside an otherwise
    dot-separated name. "post.publish.failed" and "post.publishFailed" are wrong.
    """
    # TODO: check idempotency_key against your store and return early if seen.
    #   if store.has(idempotency_key): return

    event_type = event["type"]
    resource = extract_resource(event)

    # --- Social profiles (data.profile) -------------------------------------
    if event_type == "social_profile.connected":
        print(f"🔗 Profile connected: {resource.get('name')} ({resource.get('channel')})")
    elif event_type == "social_profile.disconnected":
        print(f"🔌 Profile disconnected: {resource.get('name')}")
    elif event_type == "social_profile.reconnect_needed":
        # Act on this one — scheduled posts on this profile will start failing.
        print(f"⚠️  Profile needs reconnecting: {resource.get('name')} ({resource.get('channel')})")

    # --- Posts (data.post) --------------------------------------------------
    elif event_type == "post.created":
        # post.created uses `channels` (LIST), unlike post.published's singular
        # `channel`. Per-channel content is in `linkedIn` and `x` (both nullable).
        channels = ", ".join(resource.get("channels") or [])
        print(f"📝 Post created: {resource.get('title')} [{channels}] status={resource.get('status')}")
    elif event_type == "post.scheduled":
        print(f"📅 Post scheduled: {resource.get('title')}")
    elif event_type == "post.rescheduled":
        print(f"🔄 Post rescheduled: {resource.get('title')}")
    elif event_type == "post.unscheduled":
        print(f"🚫 Post unscheduled: {resource.get('title')}")
    elif event_type == "post.published":
        # `postUrl` is the live link on the channel and MAY BE NULL; `url` is the
        # Ordinal app link. `campaign` may be null too.
        print(
            f"🚀 Post published: {resource.get('title')} → "
            f"{resource.get('postUrl') or '(no channel URL)'}"
        )
    elif event_type == "post.publish_failed":
        # data.post.error carries the reason (e.g. "Token expired"), and this
        # event has createdBy + failedAt rather than publishedBy + publishedAt.
        print(f"❌ Publish failed: {resource.get('title')} — {resource.get('error')}")
    elif event_type == "post.archived":
        print(f"🗄️  Post archived (moved to trash): {resource.get('title')}")
    elif event_type == "post.permanently_deleted":
        print(f"🗑️  Post permanently deleted: {resource.get('id')}")
    elif event_type == "post.content.edited":
        # DEBOUNCED PER POST — fires ~5 minutes after edits and includes the
        # latest content for ALL channels. Treat it as current state, not a diff.
        print(f"✏️  Post content edited (debounced ~5m): {resource.get('title')}")

    # --- Comments (data.comment, NOT data.post) -----------------------------
    elif event_type == "post.comment.created":
        # Post-level comment.
        post = resource.get("post") or {}
        print(f"💬 Comment on \"{post.get('title')}\": {resource.get('message')}")
    elif event_type == "post.inline_comment.created":
        # Text-anchored comment. One event per comment, INCLUDING replies in a
        # thread (documented for inline comments); thread context is in `thread`.
        post = resource.get("post") or {}
        print(f"💬 Inline comment on \"{post.get('title')}\": {resource.get('message')}")

    # --- Approvals (data.approval for BOTH post.* and campaign.*) -----------
    elif event_type == "post.approval.requested":
        post = resource.get("post") or {}
        count = len(resource.get("createdApprovals") or [])
        print(f"🔍 Approval requested on \"{post.get('title')}\" for {count} approver(s)")
    elif event_type == "post.approval.approved":
        post = resource.get("post") or {}
        print(f"✅ Post approved: {post.get('title')}")
    elif event_type == "campaign.approval.requested":
        # Same data.approval key, but with `campaign` instead of `post`.
        campaign = resource.get("campaign") or {}
        print(f"🔍 Campaign approval requested: {campaign.get('name')}")
    elif event_type == "campaign.approval.approved":
        campaign = resource.get("campaign") or {}
        print(f"✅ Campaign approved: {campaign.get('name')}")

    # --- Invites (data.invite) ----------------------------------------------
    elif event_type == "invite.created":
        # If the invitee already has an account they are added directly and NO
        # email is sent — don't promise "check your inbox" on this event.
        print(f"✉️  Invite created for {resource.get('email')}")
    elif event_type == "invite.accepted":
        print(f"🎉 Invite accepted by {resource.get('email')}")

    else:
        # New topics may appear before this skill is updated. Log and move on
        # rather than guessing the payload shape. There is no `ping` event.
        print(f"ℹ️  Unhandled Ordinal event type: {event_type}")


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}
