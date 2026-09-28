# Generated with: circleci-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""CircleCI outbound webhook receiver.

CircleCI OUTBOUND webhooks (CircleCI -> your endpoint), sent when a workflow or
job reaches a terminal state.

  header  : circleci-signature
  format  : comma-separated `<version>=<signature>` pairs, e.g. `v1=<hex>`
  version : v1 only. "Only check the latest signature type to prevent downgrade
            attacks." No v1 entry -> reject.
  algo    : HMAC-SHA256, LOWERCASE HEX (64 chars), not base64
  signs   : the RAW request body bytes ONLY -- no timestamp, no id, no prefix
  key     : the webhook's "Secret token" (v2 API field `signing-secret`), used
            as UTF-8 bytes DIRECTLY. No prefix to strip, no base64 decode.

There is NO timestamp header and NO replay window in CircleCI's scheme. Replay
protection is deduplication on the payload `id`.

CircleCI publishes no SDK for webhook verification in any language -- its docs
give a plain ``hmac.new(bytes(secret, 'utf-8'), bytes(body, 'utf-8'),
'sha256').hexdigest()`` sample and nothing more. Manual HMAC is the only path.

Not Circle (circle.com, USDC / Circle Mint, ECDSA X-Circle-Signature) --
unrelated company. Not CircleCI *custom* webhooks, which are inbound pipeline
triggers going the other direction.
"""

import hashlib
import hmac
import json
import logging
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request, Response, status

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("circleci-webhooks")

app = FastAPI(title="CircleCI Webhooks")


def verify_circleci_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify a CircleCI outbound webhook signature.

    Args:
        raw_body: RAW, unparsed request body bytes.
        signature_header: The ``circleci-signature`` header value.
        secret: CIRCLECI_WEBHOOK_SECRET -- the webhook's Secret token.

    Returns:
        True only if a ``v1`` entry is present and matches.
    """
    # Fail closed. A missing header or an unconfigured secret is a rejection,
    # never a free pass -- CircleCI's Secret token is optional in the web UI, so
    # unsigned deliveries are a real possibility and must not be accepted.
    if not signature_header or not secret:
        return False

    # The header is a COMMA-separated list of `<version>=<signature>` pairs.
    # Split each pair on the FIRST '=' so a value containing '=' is never
    # truncated, and take the entry whose key is exactly `v1`.
    v1: Optional[str] = None
    for pair in signature_header.split(","):
        version, sep, sig = pair.strip().partition("=")
        if not sep:
            continue
        if version.strip() == "v1":
            v1 = sig.strip()
            break

    # No v1 entry -> REJECT. v2/v3 do not exist yet and their algorithm is
    # unknown; accepting one as a fallback is precisely the downgrade attack the
    # docs warn about.
    if not v1:
        return False

    # Sign the RAW BODY BYTES ONLY. The secret string's UTF-8 bytes are the key
    # -- no prefix to strip, no base64 decoding.
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # compare_digest is constant-time and safe on differing lengths. Compare
    # BYTES, not str: `v1` is attacker-controlled (Starlette decodes headers as
    # latin-1), and compare_digest raises TypeError on non-ASCII str input,
    # which would turn a garbage header into a 500 that CircleCI retries.
    return hmac.compare_digest(v1.encode("utf-8"), expected.encode("utf-8"))


def extract_vcs_info(pipeline: Optional[Dict[str, Any]] = None) -> Dict[str, Optional[str]]:
    """Read branch / commit info from a pipeline, handling BOTH payload shapes.

    ``pipeline.vcs`` is present for GitHub OAuth and Bitbucket Cloud pipelines.
    GitLab and GitHub App pipelines carry ``pipeline.trigger_parameters``
    instead and have NO ``vcs`` at all -- so ``pipeline["vcs"]["branch"]``
    raises a KeyError on those.
    """
    pipeline = pipeline or {}

    vcs = pipeline.get("vcs")
    if vcs:
        commit = vcs.get("commit") or {}
        author = commit.get("author") or {}
        return {
            "source": "vcs",
            "provider": vcs.get("provider_name"),
            "branch": vcs.get("branch"),
            "tag": vcs.get("tag"),
            "revision": vcs.get("revision"),
            "subject": commit.get("subject"),
            "author_name": author.get("name"),
            "repository_url": vcs.get("target_repository_url") or vcs.get("origin_repository_url"),
        }

    # GitLab / GitHub App pipelines. Field names below are the ones in
    # CircleCI's documented GitLab sample: `git` carries {branch, tag, ref,
    # checkout_sha, checkout_url}; commit title/author/web URL live in the
    # `gitlab` map (the reference says that map is present for GitLab AND
    # GitHub App triggers). `git.tag` is "" (not absent) on branch builds,
    # hence `or None`.
    params = pipeline.get("trigger_parameters") or {}
    git = params.get("git") or {}
    gitlab = params.get("gitlab") or {}
    circleci_params = params.get("circleci") or {}

    return {
        "source": "trigger_parameters",
        "provider": circleci_params.get("trigger_type"),
        "branch": git.get("branch") or gitlab.get("branch") or None,
        "tag": git.get("tag") or None,
        "revision": git.get("checkout_sha")
        or gitlab.get("commit_sha")
        or gitlab.get("checkout_sha")
        or None,
        "subject": gitlab.get("commit_title") or None,
        "author_name": gitlab.get("commit_author_name") or None,
        "repository_url": gitlab.get("web_url") or git.get("checkout_url") or None,
    }


# --- Deduplication -----------------------------------------------------------
#
# CircleCI: "Webhook requests may be duplicated." There is NO delivery-id
# header, so the payload's top-level `id` is the dedupe key. The retry schedule
# is undocumented, so retain generously.
#
# In production use Redis/Postgres with a TTL, not an in-process set.
_processed_event_ids: set[str] = set()


def already_processed(event_id: Optional[str]) -> bool:
    if not event_id:
        return False
    if event_id in _processed_event_ids:
        return True
    _processed_event_ids.add(event_id)
    return False


def handle_event(event_type: Optional[str], payload: Dict[str, Any]) -> None:
    """Dispatch a verified event. Runs AFTER the 200 response.

    CircleCI's timeout is 10 seconds, so never do real work inline.
    """
    vcs = extract_vcs_info(payload.get("pipeline"))
    project_slug = (payload.get("project") or {}).get("slug")

    if event_type == "workflow-completed":
        # workflow.status: success | failed | error | canceled | unauthorized
        workflow = payload.get("workflow") or {}
        pipeline_number = (payload.get("pipeline") or {}).get("number")
        ref = vcs.get("branch") or vcs.get("tag") or "n/a"
        logger.info(
            '[workflow-completed] %s "%s" -> %s (pipeline #%s, branch %s)',
            project_slug,
            workflow.get("name"),
            workflow.get("status"),
            pipeline_number,
            ref,
        )
        logger.info("  %s", workflow.get("url"))

        if workflow.get("status") == "success":
            pass  # TODO: promote the build, deploy, mark the commit green.
        elif workflow.get("status") in ("failed", "error"):
            pass  # TODO: alert the team, open an incident, record a DORA failure.

    elif event_type == "job-completed":
        # job.status: success | failed | canceled | unauthorized (NO "error").
        # NOTE: payload["workflow"] has NO `status` on job-level webhooks.
        job = payload.get("job") or {}
        logger.info(
            '[job-completed] %s job "%s" -> %s',
            project_slug,
            job.get("name"),
            job.get("status"),
        )
        # TODO: record job timings, track flaky tests, ingest artifacts.

    elif event_type == "ping":
        # COMMUNITY-OBSERVED, not documented. The UI's "Test Ping Event" button
        # sends a normal signed POST; the docs say only that it has "an
        # abbreviated payload for ease of testing" and never publish the `type`.
        # Acknowledge it and read nothing beyond `id`/`type`.
        logger.info('[ping] webhook "%s" reachable', (payload.get("webhook") or {}).get("name"))

    else:
        # Payloads are "open maps" -- new fields (and conceivably new types) may
        # appear without notice. Log and move on; never raise.
        logger.info("[unhandled] circleci-event-type: %s", event_type)


@app.post("/webhooks/circleci")
async def circleci_webhook(request: Request, background_tasks: BackgroundTasks) -> Response:
    secret = os.environ.get("CIRCLECI_WEBHOOK_SECRET")

    # Fail closed on misconfiguration. 500 (not 200) so CircleCI retries once
    # the secret is set, rather than silently swallowing real events.
    if not secret:
        logger.error(
            "CIRCLECI_WEBHOOK_SECRET is not set - refusing to accept unverified webhooks"
        )
        return _json(
            {"error": "Webhook secret not configured"},
            status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # RAW body bytes, read before any JSON parsing.
    raw_body = await request.body()
    signature = request.headers.get("circleci-signature")
    event_type = request.headers.get("circleci-event-type")

    if not signature:
        # The Secret token is optional in CircleCI's UI, so a webhook can be
        # configured to send unsigned requests. Reject them rather than trusting.
        logger.error("Missing circleci-signature header")
        return _json({"error": "Missing signature header"}, status.HTTP_400_BAD_REQUEST)

    # 1. VERIFY against the raw bytes, before anything is parsed.
    if not verify_circleci_signature(raw_body, signature, secret):
        logger.error("CircleCI webhook signature verification failed")
        return _json({"error": "Invalid signature"}, status.HTTP_400_BAD_REQUEST)

    # 2. PARSE -- only after verification passes.
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _json({"error": "Invalid JSON"}, status.HTTP_400_BAD_REQUEST)

    if not isinstance(payload, dict):
        return _json({"error": "Invalid JSON"}, status.HTTP_400_BAD_REQUEST)

    # 3. DEDUPE on the payload `id`. No delivery-id header exists.
    if already_processed(payload.get("id")):
        logger.info("Duplicate delivery %s ignored", payload.get("id"))
        return _json({"received": True, "duplicate": True}, status.HTTP_200_OK)

    # 4. RESPOND FAST, then work. CircleCI's timeout is 10 seconds.
    #    Prefer the header, fall back to the body's `type` -- same value.
    background_tasks.add_task(handle_event, event_type or payload.get("type"), payload)

    return _json({"received": True}, status.HTTP_200_OK)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


def _json(body: Dict[str, Any], status_code: int) -> Response:
    """JSON response helper.

    Returned explicitly rather than raised as HTTPException so the body shape
    stays identical across every status code.
    """
    return Response(
        content=json.dumps(body),
        status_code=status_code,
        media_type="application/json",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
