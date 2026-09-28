# Generated with: docker-hub-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

# Docker Hub repository webhooks are UNSIGNED.
#
#   1. THERE IS NO SIGNATURE VERIFICATION. No signature header, no shared
#      secret, no HMAC, no timestamp, no auth option. The create-webhook form
#      takes exactly two inputs: a name and a destination URL. Do NOT write an
#      HMAC verifier or check for an X-Docker-Signature / X-Hub-Signature
#      header — no such header is sent. Docker also publishes no source-IP
#      allowlist, so there is nothing to allowlist either.
#   2. THERE IS NO EVENT TYPE. Docker Hub webhooks have one trigger (a push)
#      and the payload carries no `event` / `type` / `action` field and no
#      X-...-Event header. Never branch on an event type. Route on
#      repository.repo_name + push_data.tag, and branch on the presence of
#      dhi_metadata.
#
# What replaces verification: a long random token in the URL you register
# (compared in constant time, failing closed when unset), a repository
# allowlist, and re-confirming the push against the Docker Hub API before
# doing anything consequential.

app = FastAPI(title="Docker Hub Webhook Handler")

if not os.getenv("DOCKER_HUB_WEBHOOK_TOKEN"):
    print(
        "WARNING: DOCKER_HUB_WEBHOOK_TOKEN is not set — the webhook route will "
        "fail closed with 500. Docker Hub provides no signing secret, so this "
        "token (which you place in the registered URL yourself) is the only "
        "authentication available. Generate one with: openssl rand -hex 32"
    )


def verify_url_token(provided: Optional[str], expected: Optional[str]) -> Optional[bool]:
    """
    Check the secret token taken from the webhook URL path.

    This is NOT a Docker Hub signature — Docker Hub signs nothing. It is your own
    secret, placed in the URL you registered and echoed straight back to you, so
    it is visible to Docker Hub and to anything that logs request paths. A path
    segment and a `?token=` query param are equally visible to Docker Hub; the
    path segment is a style choice, not a security gain.

    Returns None when unconfigured — the caller MUST fail closed.
    """
    if not expected:
        return None  # unset => fail closed, never silently accept
    if not provided:
        return False
    # Compare BYTES, not str: hmac.compare_digest() raises TypeError on str
    # values containing non-ASCII characters, and the token is attacker-supplied.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


def parse_push(payload: Any) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Minimal, defensive shape validation.

    Only `push_data.tag` and `repository.repo_name` are required — every other
    documented field may be absent or null, and the documented example payload
    is from 2014 (it still carries `dockerfile` / `is_trusted` from the retired
    Automated Builds era). Unknown fields are ignored, not asserted on.

    Returns (parsed, None) on success or (None, error) on failure.
    """
    if not isinstance(payload, dict):
        return None, "payload is not a JSON object"

    push_data = payload.get("push_data")
    repository = payload.get("repository")

    if not isinstance(push_data, dict):
        return None, "missing push_data"
    if not isinstance(repository, dict):
        return None, "missing repository"

    tag = push_data.get("tag")
    repo_name = repository.get("repo_name")

    if not isinstance(tag, str) or tag == "":
        return None, "missing or invalid push_data.tag"
    if not isinstance(repo_name, str) or repo_name == "":
        return None, "missing or invalid repository.repo_name"

    pusher = push_data.get("pusher")
    pushed_at = push_data.get("pushed_at")

    return (
        {
            "tag": tag,
            "repo_name": repo_name,
            "pusher": pusher if isinstance(pusher, str) else None,
            # UNIX SECONDS (inferred from the 10-digit documented example; the
            # docs never state the unit). Note bool is a subclass of int in
            # Python, so exclude it explicitly.
            "pushed_at": pushed_at
            if isinstance(pushed_at, int) and not isinstance(pushed_at, bool)
            else None,
        },
        None,
    )


def summarize_dhi_metadata(dhi_metadata: Any) -> List[Dict[str, Any]]:
    """
    Summarize the dhi_metadata object, present only on pushes to a mirrored
    Docker Hardened Image repository.

    It is a MAP KEYED BY ARCHITECTURE-SPECIFIC MANIFEST DIGEST, with one entry
    per platform that has a changelog — match the digest key against the
    platform you care about instead of assuming a single entry.

    Note: Docker builds this from a signed changelog attestation at delivery
    time, but the POST carrying it is still unsigned and the embedded copy is
    not independently verifiable.
    """
    if not isinstance(dhi_metadata, dict):
        return []

    summary: List[Dict[str, Any]] = []
    for digest, entry in dhi_metadata.items():
        e = entry if isinstance(entry, dict) else {}
        changes = e.get("changes") if isinstance(e.get("changes"), dict) else {}
        previous = (
            e.get("previous_version") if isinstance(e.get("previous_version"), dict) else {}
        )
        schema_version = e.get("schema_version")
        categories = e.get("change_categories")
        previous_tag = previous.get("tag")

        summary.append(
            {
                "digest": digest,
                "schema_version": schema_version
                if isinstance(schema_version, int) and not isinstance(schema_version, bool)
                else None,
                # Any of: vulnerability_fix, version_upgrade, other. An empty
                # list means the build had no changes at all.
                "categories": categories if isinstance(categories, list) else [],
                "previous_tag": previous_tag if isinstance(previous_tag, str) else None,
                # "When a change type has no entries, its array is present but empty."
                "vulnerabilities_fixed": len(changes.get("vulnerabilities_fixed", []))
                if isinstance(changes.get("vulnerabilities_fixed"), list)
                else 0,
                "packages_updated": len(changes.get("packages_updated", []))
                if isinstance(changes.get("packages_updated"), list)
                else 0,
            }
        )

    return summary


# Cached Docker Hub API JWT: (token, expires_at_monotonic).
_cached_hub_jwt: Optional[Tuple[str, float]] = None


async def hub_api_jwt() -> Optional[str]:
    """
    Exchange a Docker Hub credential for the short-lived JWT the Hub API wants.

    A PAT/OAT is NOT itself a bearer token for hub.docker.com (per the Hub API
    reference), and an unrecognised bearer value gets a 401 even on a public repo.
    It is the `secret` you POST
    to /v2/auth/token, which returns `access_token`: a short-lived JWT that IS
    the bearer token. Cached here because it expires.
    """
    global _cached_hub_jwt

    identifier = os.getenv("DOCKER_HUB_API_IDENTIFIER")
    secret = os.getenv("DOCKER_HUB_API_TOKEN")
    if not identifier or not secret:
        return None

    if _cached_hub_jwt and _cached_hub_jwt[1] > time.monotonic():
        return _cached_hub_jwt[0]

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://hub.docker.com/v2/auth/token",
            json={"identifier": identifier, "secret": secret},
        )
    if response.status_code != 200:
        return None

    access_token = response.json().get("access_token")
    if not isinstance(access_token, str):
        return None

    # The JWT is short-lived; re-exchange well before any plausible expiry.
    _cached_hub_jwt = (access_token, time.monotonic() + 300)
    return access_token


async def confirm_tag(repo_name: str, tag: str) -> Optional[Dict[str, Any]]:
    """
    OPTIONAL and ILLUSTRATIVE: re-confirm the pushed tag against Docker Hub.

    The webhook is unsigned, so the payload is an untrusted HINT, not a fact.
    Before deploying, promoting or pulling, check the tag against the API
    (operationId GetRepositoryTag) and prefer pulling by digest over by tag.

    Disabled unless DOCKER_HUB_API_TOKEN is set — the tests never hit the network.
    """
    if not os.getenv("DOCKER_HUB_API_TOKEN"):
        return None

    parts = repo_name.split("/")
    if len(parts) != 2 or not parts[0] or not parts[1]:
        return None
    namespace, repository = parts

    url = (
        f"https://hub.docker.com/v2/namespaces/{namespace}"
        f"/repositories/{repository}/tags/{tag}"
    )

    # GetRepositoryTag needs no auth at all for a PUBLIC repository, so send the
    # header only when the credential exchange produced a JWT. Never send the raw
    # PAT/OAT as the bearer: that turns a working call into a 401.
    jwt = await hub_api_jwt()
    headers = {"Authorization": f"Bearer {jwt}"} if jwt else {}

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers)
        if response.status_code != 200:
            return None
        return response.json()


def allowed_repos() -> List[str]:
    """OPTIONAL comma-separated repository.repo_name allowlist."""
    raw = os.getenv("DOCKER_HUB_ALLOWED_REPOS", "")
    return [r.strip() for r in raw.split(",") if r.strip()]


# POST, with a JSON body. There is no signature to verify, so there is no
# raw-body requirement here — but the body is read as bytes and parsed manually
# so invalid JSON becomes a 400 rather than FastAPI's 422.
@app.post("/webhooks/docker-hub/{token}")
async def docker_hub_webhook(token: str, request: Request):
    # 1. Fail closed when no token is configured. Treating "unconfigured" as
    #    "accept everything" would be worse than having no handler, because it
    #    looks secure.
    token_check = verify_url_token(token, os.getenv("DOCKER_HUB_WEBHOOK_TOKEN"))
    if token_check is None:
        print("Docker Hub webhook refused: DOCKER_HUB_WEBHOOK_TOKEN is not set")
        return JSONResponse(status_code=500, content={"error": "Webhook token not configured"})
    if token_check is False:
        print("Docker Hub webhook rejected: URL token mismatch")
        return JSONResponse(status_code=401, content={"error": "Invalid token"})

    # 2. Parse the body. Invalid JSON is a 400, not a 500.
    body = await request.body()
    try:
        payload = json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        print("Docker Hub webhook rejected: invalid JSON body")
        return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

    parsed, error = parse_push(payload)
    if error is not None:
        print(f"Docker Hub webhook rejected: {error}")
        return JSONResponse(status_code=400, content={"error": error})
    assert parsed is not None

    # 3. Repository allowlist. Without it, anyone who learns the URL can name any
    #    repository — including one they control — and steer whatever happens
    #    next. (Returning 200 and silently ignoring is a defensible alternative;
    #    this example chooses an explicit, greppable 403.)
    allowlist = allowed_repos()
    if allowlist and parsed["repo_name"] not in allowlist:
        print(f"Docker Hub webhook rejected: {parsed['repo_name']} is not in the allowlist")
        return JSONResponse(status_code=403, content={"error": "Repository not allowed"})

    # There is NO event type to switch on — route on the repo and tag instead.
    print(
        f"Docker Hub push: {parsed['repo_name']}:{parsed['tag']} "
        f"by {parsed['pusher'] or 'unknown'}"
    )

    # Mirrored Docker Hardened Image repositories add dhi_metadata. Its presence
    # is the only payload-shape variation — and it is NOT an event type.
    for entry in summarize_dhi_metadata(payload.get("dhi_metadata")):
        categories = ", ".join(entry["categories"]) or "no changes"
        print(
            f"  DHI {entry['digest']}: [{categories}] "
            f"{entry['vulnerabilities_fixed']} CVE(s) fixed, "
            f"{entry['packages_updated']} package(s) updated, "
            f"previous tag {entry['previous_tag'] or 'unknown'}"
        )

    # `callback_url` is a LEGACY field and is no longer supported. It still
    # appears in the documented example payload, so tolerate it — but never POST
    # to it. Webhook chains are gone, and the URL was reported to
    # 404 on GET and POST (docker/docs#23955).

    # 4. Re-confirm before acting. Off unless DOCKER_HUB_API_TOKEN is set. In
    #    production move this (and your real processing) onto a background task
    #    or queue so the acknowledgement isn't delayed — retry policy and
    #    timeout are undocumented, so acknowledge fast and dedupe on
    #    repo_name + tag + pushed_at.
    #    TODO: replace the print with your own processing, and deploy by DIGEST
    #    rather than by tag.
    try:
        record = await confirm_tag(parsed["repo_name"], parsed["tag"])
        if record:
            print(
                f"Confirmed {parsed['repo_name']}:{parsed['tag']} via Docker Hub API "
                f"(last pushed {record.get('tag_last_pushed', 'unknown')}, "
                f"digest {record.get('digest', 'unknown')})"
            )
    except Exception as err:  # noqa: BLE001 - never fail the ack on an enrichment error
        print(f"Failed to confirm tag: {err}")

    return JSONResponse(status_code=200, content={"received": True})


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))
