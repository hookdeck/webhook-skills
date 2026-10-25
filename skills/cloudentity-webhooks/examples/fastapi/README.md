# Cloudentity (SecureAuth) Webhooks - FastAPI Example

Minimal example of receiving Cloudentity webhooks and authenticating them with the `X-API-Key`
header. Cloudentity is now SecureAuth; the webhooks come from SecureAuth Connect.

SecureAuth does not sign payloads, so there is no HMAC to verify. A FastAPI dependency compares
the whole `X-API-Key` header value with your Webhook API Key using `hmac.compare_digest` on
bytes, before the body is read. A static key authenticates the sender, not the body, and gives no
replay protection: serve the endpoint over HTTPS and rotate the key if it leaks.

## Prerequisites

- Python 3.9+
- A SecureAuth Connect workspace with a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CLOUDENTITY_WEBHOOK_API_KEY` to the Webhook API Key shown when you created the webhook.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/cloudentity`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send batches of events with correct, wrong and missing keys. No SecureAuth account is
needed.

## Receive Webhooks Locally

SecureAuth can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 cloudentity --path /webhooks/cloudentity
```

Put the printed URL in the webhook's **URL** field.

## How It Works

1. The `require_cloudentity_key` dependency checks `X-API-Key` first. Failure returns `401`.
2. The body must be JSON with an `audit_events` list (`400` otherwise).
3. Each audit event is dispatched on its event name in `subject_action` form (`user_created`,
   `user_updated`, `user_deleted`, `user_authenticated`, `group_created`, `login_failed`,
   `consent_revoked`, `client_created`), read as the single key of the event's `payload` object.
   The docs don't name the field that carries the type; that location is inferred from the
   external-logging guide, so confirm it against a real delivery.
4. It returns `200 {"received": true}`.
