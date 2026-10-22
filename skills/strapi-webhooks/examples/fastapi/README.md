# Strapi Webhooks - FastAPI Example

Minimal example of receiving Strapi webhooks and authenticating them with a header you configure.

**Strapi does not sign webhook requests.** There is no signature to verify. (The "Verifying
signatures" section in Strapi's docs is guidance for a sender you build yourself; Strapi doesn't
send `X-Webhook-Signature`.) Instead, add a secret header to the webhook in Strapi and compare it
here. The handler reads the header named in `STRAPI_WEBHOOK_HEADER` (default `Authorization`),
looks it up case-insensitively, and compares the **whole** value with `STRAPI_WEBHOOK_SECRET` in
constant time. The route reads the body with `await request.body()`, so any content type
works, and parses JSON only after the credential check.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Strapi project where you can add a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `STRAPI_WEBHOOK_HEADER` to the header name you add in Strapi, and `STRAPI_WEBHOOK_SECRET`
   to its exact value, including any `Bearer ` prefix you typed.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/strapi`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented event with correct, wrong and missing credentials. No Strapi
project is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/strapi \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer my-very-secured-token" \
  -H "X-Strapi-Event: entry.publish" \
  -d '{"event":"entry.publish","createdAt":"2026-09-09T08:49:28.619Z","model":"address","uid":"api::address.address","entry":{"id":2,"documentId":"w7vfs319acmaxnurjk5vaaza","city":"Paris 1er"}}'
```

## Receive Webhooks Locally

Strapi can't reach `localhost` from Strapi Cloud or a remote host. Tunnel to your machine with the
Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 strapi --path /webhooks/strapi
```

Put the printed URL in the Strapi webhook form, along with your auth header.

## How It Works

- `main.py`: `verifyStrapiRequest()` plus the `POST /webhooks/strapi` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the body's `event` (the `X-Strapi-Event` header carries the same
   value): `entry.create`, `entry.update`, `entry.delete`, `entry.publish`, `entry.unpublish`,
   `entry.draft-discard`, `media.create`, `media.update`, `media.delete`,
   `review-workflows.updateEntryStage`, `releases.publish`.
4. It returns `200 {"received": true}`.
