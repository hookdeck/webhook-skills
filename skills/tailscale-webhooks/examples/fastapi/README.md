# Tailscale Webhooks - FastAPI Example

Minimal example of receiving Tailscale webhooks with `Tailscale-Webhook-Signature` verification.

## Prerequisites

- Python 3.10+
- A Tailscale tailnet where you can create webhook endpoints (Owner, Admin, Network admin, or IT admin)

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

3. Add your Tailscale webhook secret (`tskey-webhook-...`, shown once when the endpoint is created) to `.env` as `TAILSCALE_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/tailscale`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 tailscale --path /webhooks/tailscale
```

Use the tunnel URL as the **Webhook URL** on the Webhooks page of the Tailscale admin console, then choose **Test endpoint → Send test event**.

## How verification works

The `Tailscale-Webhook-Signature` header is `t=<unix>,v1=<hex>`. The handler reads the raw bytes with `await request.body()`, computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))`, compares it with `hmac.compare_digest`, and leaves the timestamp check off by default, because Tailscale's hourly retries and Hookdeck's retries and replays keep the original `t`. Set `TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (Tailscale suggests `300`) to turn it on. The body is a JSON array of events. See [../../references/verification.md](../../references/verification.md).
