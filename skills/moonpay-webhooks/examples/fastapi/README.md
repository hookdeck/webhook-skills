# MoonPay Webhooks - FastAPI Example

Minimal example of receiving MoonPay webhooks with `Moonpay-Signature-V2` verification.

## Prerequisites

- Python 3.10+
- A MoonPay account with a webhook API key (Developers page of the MoonPay dashboard)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook API key (`wk_test_...` or `wk_live_...`) to `.env` as `MOONPAY_WEBHOOK_API_KEY`.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/moonpay`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
pytest test_webhook.py
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 moonpay --path /webhooks/moonpay
```

Use the tunnel URL as the endpoint URL in the MoonPay dashboard's Webhooks settings (one setting per test/live mode).

## How verification works

The `Moonpay-Signature-V2` header is `t=<unix seconds>,s=<lowercase hex>`. The handler reads the raw body with `await request.body()`, computes `hex(HMAC-SHA256(apiKey, "<t>.<rawBody>"))`, compares it timing-safely with `s`, and leaves the timestamp check off by default, because Hookdeck retries and replays resend the original `t`. Set `MOONPAY_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`) to turn it on. Only POST webhooks are covered; GET callbacks sign the query string. See [../../references/verification.md](../../references/verification.md).
