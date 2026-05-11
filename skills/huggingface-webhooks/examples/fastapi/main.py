# Generated with: huggingface-webhooks skill
# https://github.com/hookdeck/webhook-skills

import logging
import os
import secrets
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    # python-dotenv is optional; env vars can be set directly.
    pass


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Hugging Face Webhook Handler")


def verify_huggingface_webhook(
    secret_header: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a Hugging Face webhook by comparing the X-Webhook-Secret header
    (or ?secret= query param) to the configured secret using timing-safe
    comparison.

    Hugging Face sends the secret verbatim — there is no HMAC.
    """
    if not secret_header or not secret:
        return False
    return secrets.compare_digest(secret_header, secret)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/huggingface")
async def handle_huggingface_webhook(
    request: Request,
    x_webhook_secret: Optional[str] = Header(None),
):
    expected = os.getenv("HUGGINGFACE_WEBHOOK_SECRET")
    # Header is preferred; fall back to ?secret= query parameter.
    provided = x_webhook_secret or request.query_params.get("secret")

    if not verify_huggingface_webhook(provided, expected):
        logger.error("Hugging Face webhook verification failed")
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        payload = await request.json()
    except Exception as exc:
        logger.error("Failed to parse JSON: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event") or {}
    scope = event.get("scope")
    action = event.get("action")
    if not scope or not action:
        raise HTTPException(status_code=400, detail="Invalid payload")

    repo = payload.get("repo") or {}
    discussion = payload.get("discussion")
    comment = payload.get("comment")
    updated_refs = payload.get("updatedRefs") or []
    updated_config = payload.get("updatedConfig")
    webhook = payload.get("webhook") or {}

    event_key = f"{scope}.{action}"
    logger.info("✓ Verified Hugging Face webhook (v%s)", webhook.get("version", "?"))
    logger.info("  Event: %s", event_key)
    if repo:
        logger.info(
            "  Repo: %s/%s (private=%s)",
            repo.get("type"),
            repo.get("name"),
            repo.get("private"),
        )

    if scope == "repo":
        # action: create | update | delete | move
        logger.info("📦 Repo %s: %s (%s)", action, repo.get("name"), repo.get("type"))
        if repo.get("headSha"):
            logger.info("   headSha: %s", repo["headSha"][:8])

    elif scope == "repo.content":
        logger.info(
            "📝 Repo content updated on %s: %d ref(s)",
            repo.get("name"),
            len(updated_refs),
        )
        for r in updated_refs:
            old_sha = r.get("oldSha")
            new_sha = r.get("newSha")
            ref = r.get("ref")
            if old_sha is None:
                logger.info("   + %s created (%s)", ref, (new_sha or "")[:8])
            elif new_sha is None:
                logger.info("   - %s deleted", ref)
            else:
                logger.info("   ~ %s: %s → %s", ref, old_sha[:8], new_sha[:8])

    elif scope == "repo.config":
        logger.info(
            "⚙️  Repo config updated on %s: %s",
            repo.get("name"),
            updated_config if updated_config is not None else {},
        )

    elif scope == "discussion":
        d = discussion or {}
        kind = "PR" if d.get("isPullRequest") else "Discussion"
        logger.info("💬 %s #%s %s: %s", kind, d.get("num"), action, d.get("title"))
        if d.get("status"):
            logger.info("   status: %s", d["status"])
        base = (d.get("changes") or {}).get("base")
        if base:
            logger.info("   base: %s", base)

    elif scope == "discussion.comment":
        c = comment or {}
        author = (c.get("author") or {}).get("id", "unknown")
        content = c.get("content")
        if isinstance(content, str):
            preview = content[:80]
        else:
            preview = "(hidden)"
        logger.info('🗨️  Comment %s by %s: "%s"', action, author, preview)

    else:
        # Forward-compatibility: treat narrowed scopes (e.g. repo.config.dois)
        # as an "update" on the broader scope.
        broader = ".".join(scope.split(".")[:2])
        logger.info(
            '❓ Unknown scope "%s" — treating as update on "%s"', scope, broader
        )

    return JSONResponse(
        content={
            "received": True,
            "event": event_key,
            "repo": repo.get("name"),
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code == 401:
        return JSONResponse(status_code=401, content={"error": exc.detail})
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3000"))
    logger.info("Hugging Face webhook server starting on port %s", port)
    logger.info(
        "Webhook endpoint: POST http://localhost:%s/webhooks/huggingface", port
    )
    if not os.getenv("HUGGINGFACE_WEBHOOK_SECRET"):
        logger.warning("⚠️  Warning: HUGGINGFACE_WEBHOOK_SECRET not set")
    uvicorn.run(app, host="0.0.0.0", port=port)
