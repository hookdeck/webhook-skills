# Etsy Webhooks - FastAPI Example

Minimal example of receiving Etsy webhooks with signature verification. Etsy follows the Standard Webhooks spec and has no Python SDK, so this example verifies the signature manually inside a FastAPI dependency.

## Prerequisites

- Python 3.9+
- An Etsy app with an endpoint in the Etsy Webhook portal and its `whsec_` signing secret

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

3. Add your Etsy webhook signing secret to `.env` as `ETSY_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. The webhook endpoint is `POST /webhooks/etsy`.

## Test

Run the test suite (generates real Standard Webhooks signatures):

```bash
pytest test_webhook.py -v
```

To receive real Etsy webhooks locally, start a tunnel:

```bash
npx hookdeck-cli listen 8000 etsy --path /webhooks/etsy
```

Use the printed URL as your endpoint URL in the Etsy Webhook portal (Developer Portal → Manage your apps → Go to Webhook portal), then open the endpoint's **Testing** tab and send a test event.

## How It Works

1. The `verified_etsy_event` dependency reads the raw body with `await request.body()`.
2. It strips `whsec_` from the secret, base64-decodes it, and computes HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{body}`, base64-encoded.
3. It compares that (timing-safe) with each `v1,` entry in `webhook-signature` and rejects timestamps more than 300 seconds off.
4. The route handler switches on `event["event_type"]` (`order.paid`, `listing.updated`, `inventory.out_of_stock`, …). Etsy payloads are thin: call `event["resource_url"]` with your OAuth token to fetch the full resource.
