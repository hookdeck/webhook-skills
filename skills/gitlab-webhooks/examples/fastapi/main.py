# Generated with: gitlab-webhooks skill
# https://github.com/hookdeck/webhook-skills

from fastapi import FastAPI, Request, Header, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional, Dict, Any
import secrets
import os
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(title="GitLab Webhook Handler")

# GitLab token verification
def verify_gitlab_webhook(token_header: Optional[str], secret: Optional[str]) -> bool:
    """Verify GitLab webhook token using timing-safe comparison"""
    if not token_header or not secret:
        return False

    # GitLab uses simple token comparison (not HMAC)
    # Use timing-safe comparison to prevent timing attacks
    return secrets.compare_digest(token_header, secret)


# Health check endpoint
@app.get("/health")
async def health():
    return {"status": "ok"}


# GitLab webhook endpoint
@app.post("/webhooks/gitlab")
async def handle_gitlab_webhook(
    request: Request,
    x_gitlab_token: Optional[str] = Header(None),
    x_gitlab_event: Optional[str] = Header(None),
    x_gitlab_instance: Optional[str] = Header(None),
    x_gitlab_webhook_uuid: Optional[str] = Header(None),
    x_gitlab_event_uuid: Optional[str] = Header(None),
):
    # Verify token
    if not verify_gitlab_webhook(x_gitlab_token, os.getenv("GITLAB_WEBHOOK_TOKEN")):
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

    if not os.getenv("GITLAB_WEBHOOK_TOKEN"):
        logger.warning("⚠️  Warning: GITLAB_WEBHOOK_TOKEN not set")

    uvicorn.run(app, host="0.0.0.0", port=port)