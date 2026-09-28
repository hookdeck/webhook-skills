# How to Verify Docker Hub Webhook Signatures

**You can't. Docker Hub does not sign webhooks.**

This page explains what that means, what you must not build, and what to do
instead.

## Why Signature Verification Matters — and Why It's Unavailable Here

An unsigned webhook endpoint is an unauthenticated RPC into your infrastructure.
Anyone who learns the URL can POST a body claiming that `myorg/myapp:latest` was
just pushed, and a naive handler will deploy on it. That is the threat model,
and Docker Hub gives you nothing cryptographic to close it with.

The [webhooks documentation](https://docs.docker.com/docker-hub/repos/manage/webhooks/)
documents **no signature header, no shared secret, no HMAC, no timestamp, no
token field and no auth option.** The create-webhook form takes exactly two
inputs — a name and a destination URL ("The URL must be 255 characters or
fewer"). There is no field for a secret and no field for a custom header.

A Docker community member asked in
[docker/docs#23955](https://github.com/docker/docs/issues/23955) (Jan 2026) how
to verify that a webhook came from Docker Hub. The docs team's response was only
to mark `callback_url` as legacy. **No verification mechanism was offered.** The
docs remain silent on it.

## What NOT to Build

None of these inputs exist. Building any of them produces a handler that either
rejects every delivery or only pretends to check:

| Don't build | Why |
|-------------|-----|
| An HMAC-SHA256 verifier over the raw body | There is no secret to key it with, and no signature to compare against |
| A check on `X-Docker-Signature`, `X-Hub-Signature`, `X-Hub-Signature-256`, `webhook-signature`, or any similar header | **No such header is sent.** These are invented names — `X-Hub-Signature-256` belongs to GitHub, `webhook-signature` to Standard Webhooks |
| A timestamp / replay window | No timestamp header is sent. `push_data.pushed_at` is payload data an attacker controls, not a signed timestamp |
| A shared-secret comparison against something Docker Hub sends | Docker Hub sends no secret |
| A source-IP allowlist | **Docker publishes none.** Any list you find is guesswork about Docker's egress and will break |
| Standard Webhooks (`webhook-id` / `webhook-timestamp` / `webhook-signature`) | Docker Hub does not implement Standard Webhooks |
| A `callback_url` round-trip as "validation" | The field is legacy and unsupported; the URL was reported to 404 (docker/docs#23955). See [overview.md](overview.md#the-legacy-callback_url-field) |

## What to Do Instead

Four layers, none of them provided by the platform.

### 1. A secret token in the URL

You control the URL you register, so put a long random token in it and compare
it in constant time.

```bash
openssl rand -hex 32   # -> DOCKER_HUB_WEBHOOK_TOKEN
```

Register `https://your-app.example.com/webhooks/docker-hub/<token>`, then:

```javascript
const crypto = require('crypto');

// NOT a Docker Hub signature — Docker Hub signs nothing. This is your own
// secret, placed in the URL you registered and echoed straight back to you.
function verifyUrlToken(provided, expected) {
  if (!expected) return null;               // unset => caller MUST fail closed (500)
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Guard length first: timingSafeEqual throws on a length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

```python
import hmac

def verify_url_token(provided: str | None, expected: str | None) -> bool | None:
    """None => not configured; the caller MUST fail closed with 500."""
    if not expected:
        return None
    if not provided:
        return False
    # Compare BYTES: hmac.compare_digest raises TypeError on str values
    # containing non-ASCII characters, and the token is attacker-supplied.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
```

**Properties and limits of this control — state them honestly:**

- It is a **bearer secret in a URL**. Docker Hub sees it, your reverse proxy
  sees it, and anything that logs request paths records it. Keep the route out
  of access logs where you can, and rotate the token periodically.
- **A path segment and a `?token=` query param are equally visible to Docker
  Hub.** Preferring the path segment is a style choice (it stays out of
  `Referer` headers and some analytics tools log query strings more eagerly),
  not a meaningful security gain. Don't overclaim it.
- **If the env var is unset, fail closed — return 500 and process nothing.** A
  handler that treats "no token configured" as "accept everything" is strictly
  worse than no handler, because it looks secure. The examples do this, and the
  test suites assert it.
- It authenticates **whoever holds the URL**, not Docker Hub. It cannot tell you
  the push actually happened.

### 2. Re-confirm against Docker Hub

**Treat the payload as an untrusted hint, not a fact.** Before anything
consequential — deploying, promoting, pulling, publishing — re-confirm the claim
against Docker Hub itself:

```
GET https://hub.docker.com/v2/namespaces/{namespace}/repositories/{repository}/tags/{tag}
Authorization: Bearer <jwt>
```

(operationId `GetRepositoryTag`, documented in the Docker Hub API reference.)

**That bearer token is a JWT, not your PAT.** A personal or organization access
token is *not* itself a bearer credential for `hub.docker.com`: the Hub API
reference says *"You must use each authentication type with the Create access
token route to obtain a bearer token"*. And a bad `Authorization` header is worse
than none — on a public repository that returns `200` unauthenticated, an
unrecognised bearer value gets a `401` (observed 2026-09-28). Exchange the
credential first:

```
POST https://hub.docker.com/v2/auth/token
Content-Type: application/json

{"identifier": "<username or org>", "secret": "<password | PAT | OAT>"}
```

The response's `access_token` is a short-lived JWT — that is what goes in the
`Authorization: Bearer` header on the `GetRepositoryTag` call. Cache it; it
expires, so don't re-exchange on every webhook.

**For a public repository `GetRepositoryTag` needs no auth at all** — it returns
`200` unauthenticated. So if you have no JWT, send no `Authorization` header
rather than a raw PAT. The examples do exactly this.

Check that:

- the tag **exists**;
- `tag_last_pushed` is recent and consistent with `push_data.pushed_at`;
- the image `digest` is what you expect.

Then **pull by digest rather than by tag**. A digest pin means that even a
forged webhook can at worst make you re-deploy an image you already verified,
rather than whatever currently sits behind a mutable tag.

This closes the gap the missing signature leaves: the webhook becomes a *hint
that something may have changed*, and Docker Hub's API becomes the authority on
what actually did. The examples keep this step **optional and illustrative** —
it is off unless `DOCKER_HUB_API_TOKEN` is set, and the test suites never hit the
network.

### 3. Validate the shape, and allowlist repositories

Require the two fields you actually route on, and reject anything malformed with
`400`:

- `push_data.tag` — a non-empty string
- `repository.repo_name` — a non-empty string

Then allowlist the repositories you expect (`DOCKER_HUB_ALLOWED_REPOS`,
comma-separated) and reject the rest. **The examples return `403` for a repo
outside the allowlist** — an explicit, greppable signal in your logs. Returning
`200` and silently ignoring is a defensible alternative (it gives a prober no
information and keeps Docker Hub's delivery history green); pick one and be
consistent.

Without an allowlist, anyone who learns your URL can name *any* repository —
including one they control — and steer whatever your handler does next.

### 4. What Hookdeck does and doesn't do

Hookdeck's source type for this provider is **`DOCKER_HUB`**, configured as **"No
verification (schema only)"**, with the code comment *"Docker Hub repository
webhooks are unsigned (no secret, signature or auth header)."*

| Claim | True? |
|-------|-------|
| Hookdeck verifies Docker Hub signatures | **No.** There is nothing to verify |
| A Hookdeck source URL is unguessable | Yes — the same class of protection as the secret URL token, applied at the gateway |
| Docker Hub can send Basic auth or custom headers to Hookdeck | **No.** Not offered in the create-webhook form, and undocumented |
| Hookdeck can add verification to the Hookdeck → your destination hop | Yes — Hookdeck's own outbound signature. That secures the **second hop only**, and says nothing about whether the inbound request came from Docker Hub |

Docker Hub is not yet listed at hookdeck.com/docs/sources (checked 2026-09-28),
so there is no provider guide page for it there yet.

## Common Gotchas

- **There is no raw-body requirement here.** Every other skill in this repo
  insists on the raw body because the signature is computed over it. With no
  signature, `express.json()` / `await request.json()` / a Pydantic model are all
  fine. Parse defensively and return `400` on invalid JSON.
- **There is no event type to switch on.** No `event`, `type` or `action` field,
  and no `X-...-Event` header. `payload.event` is always `undefined`, so
  `switch (payload.event)` never matches. Route on `repository.repo_name` and
  `push_data.tag`; branch on the presence of `dhi_metadata`.
- **`callback_url` is legacy — ignore it, never POST to it.** It still appears
  in the documented example payload, so your parser must tolerate it.
- **`dhi_metadata` is a map keyed by manifest digest, not a single object.**
  Iterate its entries; a multi-platform push has one per platform. Don't assume
  a single entry.
- **A signed attestation does not make the webhook signed.** Docker builds
  `dhi_metadata` from a signed changelog attestation at delivery time, but the
  POST carrying it is still unsigned and the embedded copy carries no signature
  you can check.
- **There is no image digest in `push_data`.** Fetch it from the Hub API or the
  registry.
- **`pushed_at` and `date_created` are UNIX seconds** — inferred from the
  10-digit example values; the docs never state the unit. Don't feed them to a
  millisecond-based date constructor.
- **The registered URL must be ≤ 255 characters.** Budget for the token.
- **Retry policy, timeout and request headers are undocumented.** Don't code
  against a `User-Agent` string or an exact `Content-Type` value, and handle
  deliveries idempotently regardless (dedupe on `repo_name` + `tag` +
  `pushed_at`).

## How to Debug Verification Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| Every delivery returns `500` | `DOCKER_HUB_WEBHOOK_TOKEN` is unset — the handler is failing closed, by design | Set the env var to the token that is in the registered URL |
| Every delivery returns `401` | The token in the registered URL doesn't match the env var | Compare them character for character; check for a trailing slash, a truncated URL (255-char limit), or a stale token after a rotation |
| Delivery returns `400` | Invalid JSON, or `push_data.tag` / `repository.repo_name` missing or not a string | Log the raw body once (scrub it afterwards) and compare against the documented payload |
| Delivery returns `403` | `repository.repo_name` isn't in `DOCKER_HUB_ALLOWED_REPOS` | Add the repo, or unset the allowlist. Check the exact `namespace/name` spelling |
| Nothing arrives at all, and **View History** is empty | The webhook never fired | Confirm you actually pushed to *that* repository, and that the webhook is on the repository you think it is |
| **View History** shows failures | Your endpoint is unreachable, too slow, or returned non-2xx | Check it is publicly reachable over HTTPS; acknowledge fast and do the work asynchronously |
| You're looking for the signature header in the request | There isn't one | Stop looking. See the top of this page |

## References

- [Docker Hub webhooks](https://docs.docker.com/docker-hub/repos/manage/webhooks/)
- [Automate syncing with webhooks (DHI)](https://docs.docker.com/dhi/how-to/mirror/#automate-syncing-with-webhooks)
- [Personal access tokens](https://docs.docker.com/security/access-tokens/personal-access-tokens/)
- [Organization access tokens](https://docs.docker.com/security/access-tokens/organization-access-tokens/)
