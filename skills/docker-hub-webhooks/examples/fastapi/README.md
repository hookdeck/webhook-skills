# Docker Hub Webhooks - FastAPI Example

Minimal example of receiving Docker Hub repository push webhooks in FastAPI.

> **There is no signature to verify.** Docker Hub does not sign webhooks — no
> signature header, no shared secret, no HMAC, no timestamp, no auth option. The
> create-webhook form takes exactly two inputs: a name and a destination URL.
> This example replaces verification with a **secret token in the URL**, a
> **repository allowlist**, and an optional **re-check against the Docker Hub
> API**. See the skill's [references/verification.md](../../references/verification.md).

## What this example shows

- `@app.post("/webhooks/docker-hub/{token}")` — the only credential is a long
  random token *you* put in the URL you register, compared with
  `hmac.compare_digest` on **bytes** (comparing `str` raises `TypeError` on
  non-ASCII input, and the token is attacker-supplied).
- **Fail closed:** if `DOCKER_HUB_WEBHOOK_TOKEN` is unset the route returns
  `500` and processes nothing. It never silently accepts.
- **No HMAC verifier, no signature header check, no replay window, no IP
  allowlist** — none of those inputs exist, and Docker publishes no source IPs.
- **No event dispatch.** Docker Hub has one trigger (a push) and no `event` /
  `type` / `action` field, so there is nothing to branch on. Routing is on
  `repository.repo_name` + `push_data.tag`.
- Defensive shape validation — `push_data.tag` and `repository.repo_name` are
  required; everything else may be absent or null; unknown fields are ignored.
  (Note `bool` is a subclass of `int` in Python, so `pushed_at` excludes it.)
- An optional repository allowlist (`DOCKER_HUB_ALLOWED_REPOS`) returning `403`.
- Summarizing `dhi_metadata` on mirrored Docker Hardened Image repositories —
  **iterating every digest key**, because it is a map with one entry per
  platform, not a single object.
- Tolerating and **ignoring** the legacy `callback_url` field. The handler makes
  no outbound request to it, and a test asserts that.

Because there is no signature, there is **no raw-body requirement** here — but
the body is read as bytes and parsed with `json.loads` so that malformed JSON
becomes a `400` rather than FastAPI's default `422`.

## Prerequisites

- Python 3.9+
- A Docker Hub repository you can add a webhook to. Only the **owner** can add
  one to a personal repository; for an organization repository you need to be an
  org owner or editor, or a team member with **admin** on the repository.

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate your URL token and put it in `.env`:
   ```bash
   openssl rand -hex 32
   ```

   There is **no webhook signing secret to configure** — Docker Hub does not
   have one. This token is your own secret, which you will embed in the URL you
   register.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

Replay the documented payload by hand:

```bash
curl -X POST "http://localhost:8000/webhooks/docker-hub/$DOCKER_HUB_WEBHOOK_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "callback_url": "https://registry.hub.docker.com/u/svendowideit/testhook/hook/2141b5bi5i5b02bec211i4eeih0242eg11000a/",
    "push_data": { "pushed_at": 1417566161, "pusher": "trustedbuilder", "tag": "latest" },
    "repository": {
      "name": "testhook",
      "namespace": "svendowideit",
      "repo_name": "svendowideit/testhook",
      "repo_url": "https://registry.hub.docker.com/u/svendowideit/testhook/",
      "is_private": true
    }
  }'
```

Docker Hub has **no test mode and no "send test event" button** — to exercise
the real path you must actually push a tag to the repository.

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 docker-hub --path /webhooks/docker-hub
```

Append your token segment so the CLI forwards to the token route:

```bash
npx hookdeck-cli listen 8000 docker-hub --path /webhooks/docker-hub/$DOCKER_HUB_WEBHOOK_TOKEN
```

No account required — the CLI creates a guest account on first run and gives you
a public HTTPS URL plus a web UI for inspecting requests. Paste that URL into
the repository's **Webhooks** tab (it must be 255 characters or fewer) and push
a tag.

Hookdeck's `DOCKER_HUB` source is **"No verification (schema only)"** — it does
not verify a Docker Hub signature, because none exists.

## Endpoint

- `POST /webhooks/docker-hub/{token}` — `500` if `DOCKER_HUB_WEBHOOK_TOKEN` is
  unset (fail closed), `401` on a token mismatch, `400` on invalid JSON or a
  missing `push_data.tag` / `repository.repo_name`, `403` if the repo is outside
  `DOCKER_HUB_ALLOWED_REPOS`, `200` otherwise.
- `GET /health` — health check.
