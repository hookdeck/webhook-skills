# Cloudflare Webhooks - FastAPI Example

Minimal example of receiving Cloudflare Notifications (generic webhook)
alerts and authenticating the `cf-webhook-auth` header. Cloudflare doesn't sign
generic webhooks: it sends the secret you configured verbatim in that header,
so the handler compares it in constant time.

## Prerequisites

- Python 3.9+
- A Cloudflare account with a webhook destination (Alerts → Destinations →
  Webhooks) that has a **Secret** set

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

3. Set `CLOUDFLARE_WEBHOOK_SECRET` in `.env` to the same value you enter in the
   **Secret** field in Cloudflare.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/cloudflare`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send the exact `cf-webhook-auth` header Cloudflare sends and cover
the wrong secret, a near-miss secret, a prefix of the secret, a missing header,
an unconfigured server, invalid JSON, and dispatch of `alert_type` values plus
the dashboard test message.

Send a request by hand:

```bash
curl -X POST http://localhost:8000/webhooks/cloudflare \
  -H "cf-webhook-auth: $CLOUDFLARE_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Example","text":"Test","data":{},"ts":1136214245,"alert_type":"health_check_status_notification"}'
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 cloudflare --path /webhooks/cloudflare
```

No account required. Paste the printed HTTPS URL into the **URL** field of the
webhook in Cloudflare, enter the same secret, and select **Save and Test**.

## Notes

- The handler is in `main.py`.
- Cloudflare accepts only a public IP on port 80 or 443 for generic webhooks.
- There's no signature or timestamp, so a captured request can be replayed;
  deduplicate on `alert_correlation_id` + `alert_event` + `ts`.
- See [../../references/verification.md](../../references/verification.md)
  for details and debugging.
