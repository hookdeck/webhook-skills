# Tailscale Webhooks - Next.js Example

Minimal example of receiving Tailscale webhooks with `Tailscale-Webhook-Signature` verification using the App Router.

## Prerequisites

- Node.js 18+
- A Tailscale tailnet where you can create webhook endpoints (Owner, Admin, Network admin, or IT admin)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Tailscale webhook secret (`tskey-webhook-...`, shown once when the endpoint is created) to `.env.local` as `TAILSCALE_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/tailscale`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 tailscale --path /webhooks/tailscale
```

Use the tunnel URL as the **Webhook URL** on the Webhooks page of the Tailscale admin console, then choose **Test endpoint → Send test event**.

## How verification works

The `Tailscale-Webhook-Signature` header is `t=<unix>,v1=<hex>`. The route reads the raw body with `request.text()`, computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))` (see `lib/tailscale.ts`), compares it timing-safely with `v1`, and leaves the timestamp check off by default, because Tailscale's hourly retries and Hookdeck's retries and replays keep the original `t`. Set `TAILSCALE_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (Tailscale suggests `300`) to turn it on. The body is a JSON array of events. See [../../references/verification.md](../../references/verification.md).
