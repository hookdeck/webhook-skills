# Sevalla Webhooks - FastAPI Example

Minimal example of receiving Sevalla webhooks and authenticating them with the `svl-signature`
header.

Sevalla does not sign requests. Despite its name and the `whsec_` prefix, `svl-signature` is **not
a signature** and not Standard Webhooks: it carries the webhook's signing secret itself. There is
no HMAC to compute. The handler compares the whole header value with your stored secret in
constant time. The route reads the raw body with `await request.body()`, so any content type works, and
parses it only after a dependency has checked the header.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and roll the secret if it leaks.

## Prerequisites

- Python 3.9+
- A Sevalla company with a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SEVALLA_WEBHOOK_SECRET` to the webhook's **Signing secret** (Tools > Webhooks > your
   webhook > Overview). Paste the whole secret, including the `whsec_` prefix. When you roll the
   secret, update it here when the new one becomes active (or set `SEVALLA_WEBHOOK_SECRET_OLD`
   to the previous one during the rollover).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/sevalla`.

## Test

```bash
pytest test_webhook.py
```

The tests send every event type with correct, wrong and missing secrets. No Sevalla account is
needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/sevalla \
  -H "Content-Type: application/json" \
  -H "svl-signature: $SEVALLA_WEBHOOK_SECRET" \
  -d '{"webhook_id":"w1","event_id":"e1","event_delivery_id":"d1","type":"APP_DEPLOY","data":{"app_display_name":"storefront","deployment_id":"dep1","status":"success","is_preview":false}}'
```

## Receive Webhooks Locally

Sevalla can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 sevalla --path /webhooks/sevalla
```

Put the printed URL in the Sevalla webhook's **Endpoint**.

## How It Works

- `main.py`: `verify_sevalla_request()`, the `require_sevalla_secret` dependency and the `POST /webhooks/sevalla` route

1. The `svl-signature` header is compared with the secret (a FastAPI dependency) before the body is parsed. Failure
   returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. Retries of an already handled `event_id` return `200` without running the handler again.
4. The handler dispatches on `type`: `APP_CREATE`, `APP_DEPLOY`, `APP_UPDATE`, `APP_DELETE`,
   `STATIC_SITE_CREATE`, `STATIC_SITE_DEPLOY`, `STATIC_SITE_UPDATE`, `STATIC_SITE_DELETE`
   (and `DATABASE_*`, which Sevalla doesn't send yet).
5. It returns `200 {"received": true}`.
