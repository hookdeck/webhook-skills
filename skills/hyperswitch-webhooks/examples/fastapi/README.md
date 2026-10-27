# Hyperswitch Webhooks - FastAPI Example

Minimal example of receiving [Hyperswitch](https://hyperswitch.io) outgoing
webhooks with signature verification (`X-Webhook-Signature-512`: HMAC-SHA512
hex of the raw body, keyed with the business profile's `payment_response_hash_key`).

## Prerequisites

- Python 3.9+
- A Hyperswitch business profile with `payment_response_hash_key` set

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

3. Set `HYPERSWITCH_WEBHOOK_SECRET` to the business profile's `payment_response_hash_key`.

   Set payment_response_hash_key on the Hyperswitch business profile and paste it here. Without it, deliveries are unsigned and fail verification. Live-mode webhook URLs must be allowlisted by Hyperswitch.

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000. The endpoint is `POST /webhooks/hyperswitch`.

## Test

```bash
pytest test_webhook.py
```

The tests generate real HMAC-SHA512 signatures and cover valid, missing, empty,
malformed, prefixed, SHA-256 and tampered signatures, exact-byte verification,
any content type, fail-closed behaviour when the secret is unset, all 33
documented `event_type` values, unknown events and `event_id` dedupe.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 hyperswitch --path /webhooks/hyperswitch
```

No account required. Add the printed URL as the endpoint under **Developers →
Payment Settings → Payment Behaviour** for your business profile, then send a
test payment. In live mode, ask the Hyperswitch team to allowlist the URL.

## What the handler does

1. Reads the **raw** body (with `await request.body()`).
2. Verifies `X-Webhook-Signature-512`. Missing, malformed or wrong: `401`.
3. Parses the JSON, acknowledges duplicate `event_id`s, then dispatches on `event_type`.
4. Returns `200` for known and unknown events alike.

See [../../references/verification.md](../../references/verification.md) for the
signature scheme and debugging tips.
