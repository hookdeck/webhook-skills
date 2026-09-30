# Generated with: gitlab-webhooks skill
# https://github.com/hookdeck/webhook-skills

from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
import base64
import hashlib
import hmac
import secrets
import os
import time
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="GitLab Webhook Handler")

# GitLab (19.0+) offers two ways to authenticate a webhook, and both can be
# configured on the same webhook:
# - Signing token (recommended): Standard Webhooks HMAC-SHA256 signature in
#   the webhook-signature header.
# - Secret token (legacy, "not recommended" by GitLab): the plain-text token
#   sent back in the X-Gitlab-Token header.
# https://docs.gitlab.com/user/project/integrations/webhooks/#signing-tokens

# GitLab says to check that webhook-timestamp is "recent" but gives no window.
# The Standard Webhooks spec asks for "some allowable tolerance"; 5 minutes is
# the default in the Standard Webhooks reference libraries.
TIMESTAMP_TOLERANCE_SECONDS = 5 * 60


def compute_gitlab_signature(
    signing_token: str, webhook_id: str, webhook_timestamp: str, raw_body: bytes
) -> str:
    """Signed content is "{webhook-id}.{webhook-timestamp}.{raw body}". The key is
    the signing token with the whsec_ prefix stripped, then base64-decoded."""
    key = base64.b64decode(signing_token.removeprefix("whsec_"))
    message = f"{webhook_id}.{webhook_timestamp}.".encode("utf-8") + raw_body
    digest = hmac.new(key, message, hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode("utf-8")


def verify_gitlab_signature(raw_body: bytes, headers, signing_token: Optional[str]) -> bool:
    """Verify a GitLab signing-token (Standard Webhooks) signature."""
    webhook_id = headers.get("webhook-id")
    webhook_timestamp = headers.get("webhook-timestamp")
    signature_header = headers.get("webhook-signature")
    if not (signing_token and webhook_id and webhook_timestamp and signature_header):
        return False

    # Reject stale or future timestamps to limit replay
    try:
        timestamp = int(webhook_timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - timestamp) > TIMESTAMP_TOLERANCE_SECONDS:
        return False

    expected = compute_gitlab_signature(signing_token, webhook_id, webhook_timestamp, raw_body)
    # The header is a space-separated list of "v1,<base64>" signatures
    return any(hmac.compare_digest(expected, sig) for sig in signature_header.split(" "))


def verify_gitlab_token(token_header: Optional[str], secret: Optional[str]) -> bool:
    """Legacy secret token: compare X-Gitlab-Token using timing-safe comparison"""
    if not token_header or not secret:
        return False

    # Use timing-safe comparison to prevent timing attacks
    return secrets.compare_digest(token_header, secret)


def verify_gitlab_webhook(raw_body: bytes, headers) -> bool:
    """GitLab's migration advice: verify the signature when webhook-signature is
    present, and fall back to the secret token otherwise. A request that carries
    a signature must pass the signature check; it never falls back."""
    signing_token = os.getenv("GITLAB_WEBHOOK_SIGNING_TOKEN")
    if signing_token and headers.get("webhook-signature"):
        return verify_gitlab_signature(raw_body, headers, signing_token)
    return verify_gitlab_token(headers.get("x-gitlab-token"), os.getenv("GITLAB_WEBHOOK_TOKEN"))


# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "ok"}


# GitLab webhook endpoint
@app.post("/webhooks/gitlab")
async def handle_gitlab_webhook(
    request: Request,
    x_gitlab_event: Optional[str] = Header(None),
    x_gitlab_instance: Optional[str] = Header(None),
    x_gitlab_webhook_uuid: Optional[str] = Header(None),
    x_gitlab_event_uuid: Optional[str] = Header(None),
):
    # Raw body: the signature covers the exact bytes GitLab sent
    raw_body = await request.body()

    # Verify signature (or legacy token) before parsing
    if not verify_gitlab_webhook(raw_body, request.headers):
        logger.error(f"GitLab webhook verification failed from {x_gitlab_instance}")
        raise HTTPException(status_code=401, detail="Unauthorized")

    logger.info(f"✓ Verified GitLab webhook from {x_gitlab_instance}")
    logger.info(f"  Event: {x_gitlab_event} (UUID: {x_gitlab_event_uuid})")
    logger.info(f"  Webhook UUID: {x_gitlab_webhook_uuid}")

    # Parse JSON body
    try:
        payload = await request.json()
    except Exception as e:
        logger.error(f"Failed to parse JSON: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Extract common fields
    object_kind = payload.get("object_kind")
    project = payload.get("project", {})
    user_name = payload.get("user_name")

    # Handle different event types
    if object_kind == "push":
        ref = payload.get("ref", "")
        branch = ref.replace("refs/heads/", "")
        before = payload.get("before", "")[:8]
        after = payload.get("after", "")[:8]
        total_commits = payload.get("total_commits_count", 0)
        logger.info(f"📤 Push to {branch} by {user_name}:")
        logger.info(f"   {total_commits} commits ({before}...{after})")

    elif object_kind == "tag_push":
        ref = payload.get("ref", "")
        tag = ref.replace("refs/tags/", "")
        before = payload.get("before", "")
        if before == "0000000000000000000000000000000000000000":
            logger.info(f"🏷️  New tag created: {tag} by {user_name}")
        else:
            logger.info(f"🏷️  Tag deleted: {tag} by {user_name}")

    elif object_kind == "merge_request":
        attrs = payload.get("object_attributes", {})
        iid = attrs.get("iid")
        title = attrs.get("title")
        state = attrs.get("state")
        action = attrs.get("action")
        source_branch = attrs.get("source_branch")
        target_branch = attrs.get("target_branch")
        logger.info(f"🔀 Merge Request !{iid} {action}: {title}")
        logger.info(f"   {source_branch} → {target_branch} ({state})")

    elif object_kind in ["issue", "work_item"]:
        attrs = payload.get("object_attributes", {})
        iid = attrs.get("iid")
        title = attrs.get("title")
        state = attrs.get("state")
        action = attrs.get("action")
        logger.info(f"📋 Issue #{iid} {action}: {title}")
        logger.info(f"   State: {state}")

    elif object_kind == "note":
        attrs = payload.get("object_attributes", {})
        note = attrs.get("note", "")[:50]
        merge_request = payload.get("merge_request")
        issue = payload.get("issue")
        commit = payload.get("commit")

        if merge_request:
            logger.info(f"💬 Comment on MR !{merge_request.get('iid')} by {user_name}")
        elif issue:
            logger.info(f"💬 Comment on Issue #{issue.get('iid')} by {user_name}")
        elif commit:
            logger.info(f"💬 Comment on commit {commit.get('id', '')[:8]} by {user_name}")
        logger.info(f"   \"{note}{'...' if len(attrs.get('note', '')) > 50 else ''}\"")

    elif object_kind == "pipeline":
        attrs = payload.get("object_attributes", {})
        id = attrs.get("id")
        ref = attrs.get("ref")
        status = attrs.get("status")
        duration = attrs.get("duration")
        logger.info(f"🔄 Pipeline #{id} {status} for {ref}")
        if duration:
            logger.info(f"   Duration: {duration}s")

    elif object_kind == "build":  # Job events
        build_name = payload.get("build_name")
        build_stage = payload.get("build_stage")
        build_status = payload.get("build_status")
        build_duration = payload.get("build_duration")
        logger.info(f"🔨 Job \"{build_name}\" {build_status} in stage {build_stage}")
        if build_duration:
            logger.info(f"   Duration: {build_duration}s")

    elif object_kind == "wiki_page":
        attrs = payload.get("object_attributes", {})
        title = attrs.get("title")
        action = attrs.get("action")
        slug = attrs.get("slug")
        logger.info(f"📖 Wiki page {action}: {title}")
        logger.info(f"   Slug: {slug}")

    elif object_kind == "deployment":
        status = payload.get("status")
        environment = payload.get("environment")
        deployable_url = payload.get("deployable_url")
        logger.info(f"🚀 Deployment to {environment}: {status}")
        if deployable_url:
            logger.info(f"   URL: {deployable_url}")

    elif object_kind == "release":
        action = payload.get("action")
        name = payload.get("name")
        tag = payload.get("tag")
        description = payload.get("description", "")
        logger.info(f"📦 Release {action}: {name} ({tag})")
        if description:
            desc_preview = description[:100]
            logger.info(f"   {desc_preview}{'...' if len(description) > 100 else ''}")

    else:
        logger.info(f"❓ Received {object_kind or x_gitlab_event} event")
        logger.info(f"   Project: {project.get('name')} ({project.get('path_with_namespace')})")

    # Return success response
    return JSONResponse(content={
        "received": True,
        "event": object_kind or x_gitlab_event,
        "project": project.get("path_with_namespace")
    })


# Error handler
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail}
    )


# Main entry point
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3000))

    logger.info(f"GitLab webhook server starting on port {port}")
    logger.info(f"Webhook endpoint: POST http://localhost:{port}/webhooks/gitlab")

    if not os.getenv("GITLAB_WEBHOOK_SIGNING_TOKEN") and not os.getenv("GITLAB_WEBHOOK_TOKEN"):
        logger.warning("⚠️  Warning: set GITLAB_WEBHOOK_SIGNING_TOKEN (or legacy GITLAB_WEBHOOK_TOKEN)")

    uvicorn.run(app, host="0.0.0.0", port=port)