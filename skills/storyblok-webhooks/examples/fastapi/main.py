import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_storyblok_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a Storyblok webhook signature.

    Storyblok sends hex(HMAC-SHA1(secret, rawBody)) in the `webhook-signature` header.
    This is NOT Standard Webhooks: no timestamp, no message ID, no prefix.
    """
    if not signature_header or not secret:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).hexdigest()

    # Use timing-safe comparison to prevent timing attacks
    return hmac.compare_digest(signature_header.strip().lower().encode(), expected.encode())


async def verified_body(
    request: Request,
    webhook_signature: str | None = Header(default=None),
) -> bytes:
    """Dependency: return the raw body only if the signature is valid."""
    # Raw body is required: the signature is computed over the exact bytes sent
    raw_body = await request.body()
    # Read the secret per request so it can be changed without re-importing
    secret = os.environ.get("STORYBLOK_WEBHOOK_SECRET")

    if not verify_storyblok_webhook(raw_body, webhook_signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")
    return raw_body


def entity_of(payload: dict) -> str:
    """Storyblok has no event-type header: the event is `action` in the body, and
    `action` is shared between entities, so pick the entity from its id field."""
    for field, entity in (
        ("experiment_id", "experiment"),
        ("release_id", "release"),
        ("branch_id", "pipeline"),
        ("datasource_slug", "datasource"),
        ("asset_id", "asset"),
        ("user_id", "user"),
        ("workflow_name", "workflow"),
        ("block_uid", "discussion"),
        ("story_id", "story"),
    ):
        if field in payload:
            return entity
    return "unknown"


@app.post("/webhooks/storyblok")
async def storyblok_webhook(raw_body: bytes = Depends(verified_body)):
    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = f"{entity_of(payload)}.{payload.get('action')}"

    if event == "story.published":
        print(f"Story published: {payload.get('full_slug')}")
        # TODO: Rebuild the site or purge the cache for this slug
    elif event == "story.unpublished":
        print(f"Story unpublished: {payload.get('full_slug')}")
        # TODO: Remove the page from the site or search index
    elif event == "story.deleted":
        print(f"Story deleted: {payload.get('full_slug')}")
        # TODO: Remove the page and clean up
    elif event == "story.moved":
        print(f"Story moved: {payload.get('old_full_slug')} -> {payload.get('full_slug')}")
        # TODO: Add a redirect from the old slug
    elif event in ("datasource.entries_updated", "datasource.entries_deleted"):
        print(f"Datasource {payload.get('datasource_slug')}: {payload.get('action')}")
        # TODO: Refresh cached datasource entries
    elif event == "workflow.stage.changed":
        print(f"Workflow {payload.get('workflow_name')} -> {payload.get('workflow_stage_name')}")
        # TODO: Notify reviewers
    elif event == "release.merged":
        print(f"Release {payload.get('release_id')} merged")
        # TODO: Rebuild the site
    elif event == "pipeline.deployed":
        print(f"Pipeline branch {payload.get('branch_id')} deployed")
        # TODO: Trigger downstream deploys
    else:
        # asset.*, user.*, discussion.*, experiment.* and anything new
        print(f"Unhandled event: {event}")

    # Storyblok expects a 2xx with content-type: application/json and does not retry
    return {"received": True, "event": event}


@app.get("/health")
async def health():
    return {"status": "ok"}
