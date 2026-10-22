# OnceHub Webhooks - Next.js Example

Minimal example of receiving OnceHub webhooks with `Oncehub-Signature` verification using the App Router.

## Prerequisites

- Node.js 18+
- A OnceHub account with administrator access (Account Integrations > APIs & Webhooks) and a **v2** webhook (v1 webhooks are not signed)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your OnceHub webhook secret (shown when the webhook is created, or later via **View secret**) to `.env.local` as `ONCEHUB_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/oncehub`.

## Test

Run the tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 oncehub --path /webhooks/oncehub
```

Use the tunnel URL as the **Webhook URL** (must be `https://`) on the APIs & Webhooks page in OnceHub, then create a sample booking to trigger `booking.scheduled`.

## How verification works

The `Oncehub-Signature` header is `t=<unix>,s=<hex>`. The route reads the raw body with `request.text()`, computes `hex(HMAC-SHA256(secret, "<t>.<rawBody>"))` (see `lib/oncehub.ts`), compares it timing-safely with `s`, and leaves the timestamp check off by default, because Hookdeck retries and replays (and OnceHub's own retries) resend the original `t`, so a 5-minute window would reject late retries. Set `ONCEHUB_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`) to turn it on. The body is a single JSON event with a `type` such as `booking.scheduled`. See [../../references/verification.md](../../references/verification.md).
