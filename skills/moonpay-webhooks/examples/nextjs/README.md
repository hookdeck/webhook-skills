# MoonPay Webhooks - Next.js Example

Minimal example of receiving MoonPay webhooks with `Moonpay-Signature-V2` verification.

## Prerequisites

- Node.js 18+
- A MoonPay account with a webhook API key (Developers page of the MoonPay dashboard)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook API key (`wk_test_...` or `wk_live_...`) to `.env` as `MOONPAY_WEBHOOK_API_KEY`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/moonpay`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 moonpay --path /webhooks/moonpay
```

Use the tunnel URL as the endpoint URL in the MoonPay dashboard's Webhooks settings (one setting per test/live mode).

## How verification works

The `Moonpay-Signature-V2` header is `t=<unix seconds>,s=<lowercase hex>`. The handler reads the raw body with `request.text()`, computes `hex(HMAC-SHA256(apiKey, "<t>.<rawBody>"))`, compares it timing-safely with `s`, and leaves the timestamp check off by default, because Hookdeck retries and replays resend the original `t`. Set `MOONPAY_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`) to turn it on. Only POST webhooks are covered; GET callbacks sign the query string. See [../../references/verification.md](../../references/verification.md).
