# Stitch Webhooks - FastAPI Example

Minimal example of receiving Stitch (stitch.money) webhooks with Svix signature
verification, using the official [`svix`](https://pypi.org/project/svix/) library.

## Prerequisites

- Python 3.10+
- A Stitch webhook subscription and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your subscription's signing secret to `.env` as `STITCH_WEBHOOK_SECRET`

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/stitch
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the same HMAC-SHA256 scheme Svix uses and cover
every Stitch event type, signature lists with `v2` / rotated entries, invalid
signatures, tampered bodies, and stale timestamps.

## Local Testing with Hookdeck

Receive real Stitch webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 stitch --path /webhooks/stitch
```

Use the printed URL as the `url` when you create the subscription
(`clientWebhookAdd`) or add an endpoint in the Svix portal. From the Svix portal
you can then resend messages from **Logs** to your tunnel.
