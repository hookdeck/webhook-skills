# OnceHub Webhooks - FastAPI Example

Minimal example of receiving OnceHub webhooks with `Oncehub-Signature` verification.

## Prerequisites

- Python 3.10+
- A OnceHub account with administrator access (Account Integrations > APIs & Webhooks) and a **v2** webhook (v1 webhooks are not signed)

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

3. Add your OnceHub webhook secret (shown when the webhook is created, or later via **View secret**) to `.env` as `ONCEHUB_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/oncehub`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 oncehub --path /webhooks/oncehub
```

Use the tunnel URL as the **Webhook URL** (must be `https://`) on the APIs & Webhooks page in OnceHub, then create a sample booking to trigger `booking.scheduled`.

## How verification works

The `Oncehub-Signature` header is `t=<unix>,s=<hex>`. The handler reads the raw bytes with `await request.body()`, computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))`, compares it with `hmac.compare_digest`, and leaves the timestamp check off by default, because Hookdeck retries and replays (and OnceHub's own retries) resend the original `t`, so a 5-minute window would reject late retries. Set `ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`) to turn it on. The body is a single JSON event with a `type` such as `booking.scheduled`. See [../../references/verification.md](../../references/verification.md).
