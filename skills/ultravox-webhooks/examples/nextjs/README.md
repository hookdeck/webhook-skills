# Ultravox Webhooks - Next.js Example

Minimal example of receiving Ultravox webhooks with signature verification
(`X-Ultravox-Webhook-Signature`, HMAC-SHA256 over the raw body followed by `X-Ultravox-Webhook-Timestamp`).

## Prerequisites

- Node.js 18+
- An Ultravox webhook with exactly one secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Ultravox webhook secret to `.env` as `ULTRAVOX_WEBHOOK_SECRET`.

> Give the Ultravox webhook exactly one secret and paste it here. A webhook without a secret is unsigned, and one with several secrets sends a list of signatures, so both fail verification.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/ultravox`

## Test

Run the test suite (generates real signatures with the Ultravox algorithm):

```bash
npm test
```

To receive real Ultravox webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 ultravox --path /webhooks/ultravox
```

Use the printed URL as the URL of your Ultravox webhook.

## Events Handled

- `call.started`
- `call.joined`
- `call.ended`
- `call.billed`

Any other event is logged and acknowledged.

## Optional Timestamp Tolerance

Old timestamps are accepted by default, because Hookdeck retries and replays resend the original
headers. To reject deliveries older than N seconds, set `ULTRAVOX_WEBHOOK_TOLERANCE_SECONDS=N`.

## Project Structure

```
├── app/webhooks/ultravox/
│   └── route.ts          # App Router POST handler + event dispatch
├── lib/
│   └── verify.ts         # Signature verification
├── test/
│   └── webhook.test.ts   # Signature verification tests
├── .env.example
├── vitest.config.ts
└── package.json
```
