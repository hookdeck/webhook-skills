# Bitrise Webhooks - FastAPI Example

Minimal example of receiving Bitrise outgoing webhooks and authenticating them with a secret
custom header.

Bitrise does not sign payloads, so there is no HMAC to verify. You add a header to the outgoing
webhook's **Headers** section, and a FastAPI dependency compares it with `BITRISE_WEBHOOK_SECRET`
using `hmac.compare_digest` on bytes. The whole header value is compared (a `Bearer ` prefix, if
you typed one, is part of the secret). A static shared credential authenticates the sender, not
the body, and gives no replay protection, so use HTTPS and rotate it if it leaks. The route reads
the raw body, so any content type works.

## Prerequisites

- Python 3.9+
- A Bitrise project with an outgoing webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtualenv and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BITRISE_WEBHOOK_HEADER` to the header name you added in Bitrise and
   `BITRISE_WEBHOOK_SECRET` to its exact value.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/bitrise`.

## Test

```bash
pytest test_webhook.py
```

The tests send Release Management payloads, and a body without `trigger_event`, with correct, wrong and missing headers.
No Bitrise account is needed.

## Receive Webhooks Locally

Bitrise can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 bitrise --path /webhooks/bitrise
```

Put the printed URL in the Bitrise outgoing webhook.

## How It Works

- `main.py`: `verify_bitrise_request()`, the `require_bitrise_secret` dependency and the route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A string `trigger_event` marks a Release Management event (`app_version_added`,
   `testflight_upload_completed`, `google_play_upload_completed`, and others). Bitrise documents
   no payload for CI build events, so any other body is acknowledged and its field names logged
   for you to inspect.
4. It returns `200 {"received": true}`.
