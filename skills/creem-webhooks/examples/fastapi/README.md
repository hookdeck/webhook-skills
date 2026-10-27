# Creem Webhooks - FastAPI Example

Minimal example of receiving Creem webhooks with FastAPI and verifying the
`creem-signature` header (HMAC-SHA256 of the raw body, lowercase hex).

## Prerequisites

- Python 3.9+
- A Creem account with a webhook endpoint registered (its signing secret is on the Developers >
  Webhook page; see [../../references/setup.md](../../references/setup.md))

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

3. Set `CREEM_WEBHOOK_SECRET` to the endpoint's signing secret from the Developers > Webhook page.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/creem`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads with the same algorithm Creem uses and cover valid, tampered,
wrong-secret, random, malformed, non-ASCII and missing signatures, any
content type, and the documented events. No Creem account is needed.

To test end to end, create a test payment in Creem's test environment, or use `creem listen
--forward-to` from the Creem CLI, which forwards events with the real signature header.

## Receive Creem Webhooks Locally

```bash
npx hookdeck-cli listen 8000 creem --path /webhooks/creem
```

Register the printed URL as a webhook endpoint on the Developers tab of the Creem dashboard.

## How It Works

- `main.py`: `verify_creem_signature()` plus the `POST /webhooks/creem` route

1. The route reads the exact bytes with `await request.body()`, so the signature covers them
   whatever the content type.
2. It computes the HMAC-SHA256 of the body with the signing secret and compares the hex digests
   with `hmac.compare_digest` on **bytes**, so a non-ASCII header gives `401`, not `500`.
3. The body must be a JSON object (`400` otherwise).
4. The handler dispatches on `eventType` (`checkout.completed`, the `subscription.*` events,
   `refund.created`, `dispute.created` and the credit events), logs anything else, and returns
   `200 {"received": true}`.
