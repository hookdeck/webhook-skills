# Trendyol Webhooks - FastAPI Example

Minimal example of receiving Trendyol order package webhooks and authenticating them with the
`x-api-key` header.

Trendyol does not sign payloads, so there is no HMAC to verify. With `authenticationType`
`API_KEY`, Trendyol sends the webhook's `apiKey` as plain text in the `x-api-key` header, and the
handler compares the whole value with `TRENDYOL_WEBHOOK_SECRET` in constant time
(`hmac.compare_digest` on encoded bytes). The route reads the raw body, so any content type
works. Basic authentication (`BASIC_AUTHENTICATION`) is not covered by Hookdeck's Trendyol source.

> Choose API key authentication (authenticationType API_KEY) when you create the Trendyol webhook.

## Prerequisites

- Python 3.9+
- A Trendyol seller account with API access (see [../../references/setup.md](../../references/setup.md))

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

3. Set `TRENDYOL_WEBHOOK_SECRET` to the `apiKey` you use when creating the webhook.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/trendyol`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented package status with correct, wrong and missing keys. No Trendyol
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/trendyol \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TRENDYOL_WEBHOOK_SECRET" \
  -d '{"content":[{"orderNumber":"10654411111","shipmentPackageId":3330111111,"status":"Delivered"}]}'
```

## Receive Webhooks Locally

Trendyol can't reach `localhost`, and rejects webhook URLs containing "Trendyol", "Dolap" or
"Localhost". Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 trendyol --path /webhooks/trendyol
```

## How It Works

- `main.py`: `verify_trendyol_request()`, the `require_trendyol_key` dependency and the route

1. The `x-api-key` header is checked by a dependency before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with a `content` list (`400` otherwise).
3. For each package in `content`, the handler dispatches on `status` (case-insensitive):
   `CREATED`, `PICKING`, `INVOICED`, `SHIPPED`, `CANCELLED`, `DELIVERED`, `UNDELIVERED`,
   `RETURNED`, `UNSUPPLIED`, `AWAITING`, `UNPACKED`, `AT_COLLECTION_POINT`, `VERIFIED`.
4. It returns `200 {"received": true}`. Failed requests are re-sent every 5 minutes, so keep
   handlers idempotent.
