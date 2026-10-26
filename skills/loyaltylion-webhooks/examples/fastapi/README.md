# LoyaltyLion Webhooks - FastAPI Example

Minimal example of receiving LoyaltyLion webhooks and verifying the `x-loyaltylion-hmac-sha256`
signature (base64 HMAC-SHA256 of the raw body).

## Prerequisites

- Python 3.9+
- A LoyaltyLion secret: the OAuth client secret for webhooks registered with an OAuth client, or your site secret for other webhooks

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LOYALTYLION_WEBHOOK_SECRET`. Paste the OAuth client secret for webhooks registered with an OAuth client, or your site secret for other webhooks.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/loyaltylion`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign real payloads (base64 HMAC-SHA256 of the raw body) shaped like the documented topics and check
valid, missing, wrong-secret, tampered, re-serialised, hex, prefixed and stray-low-bit signatures. To try it by hand:

```bash
BODY='{"id":"bff1bddb-6cd8-4c2c-9619-18744657053c","topic":"loyalty_emails/unsubscribe","created_at":"2025-01-01T03:00:05.000Z","payload":{"unsubscribe":{"customer":{"id":6936,"email":"sarah@example.com"}}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$LOYALTYLION_WEBHOOK_SECRET" -binary | base64)
curl -X POST http://localhost:8000/webhooks/loyaltylion \
  -H "Content-Type: application/json" -H "x-loyaltylion-hmac-sha256: $SIG" -d "$BODY"
```

## Receive LoyaltyLion Webhooks Locally

```bash
npx hookdeck-cli listen 8000 loyaltylion --path /webhooks/loyaltylion
```

Use the printed URL as the `address` when you subscribe with the v2 Webhook API (see
[../../references/setup.md](../../references/setup.md)).

## How It Works

- `main.py`: `verify_loyaltylion_signature()` and the `POST /webhooks/loyaltylion` route

1. `await request.body()` reads the exact bytes before anything is parsed.
2. The header must be 44-character padded base64; it is compared as bytes with `hmac.compare_digest` to the base64 HMAC-SHA256 of the raw body. A missing, malformed or wrong signature returns `401`; a missing secret returns `500`.
3. Only then is the body parsed (`400` for invalid JSON or a non-object).
4. The handler dispatches on `topic` (`rewards/store_fulfilment` has no topic and is recognised by `reward_fulfilment_id`) and logs unhandled topics.
5. It returns `200 {"received": true}` (LoyaltyLion needs a 200 within 5 seconds). LoyaltyLion delivers at least once: dedupe on the body `id`.
