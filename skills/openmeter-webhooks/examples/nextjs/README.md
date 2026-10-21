# OpenMeter Webhooks - Next.js Example

Minimal Next.js App Router example of receiving OpenMeter notification webhooks
with signature verification, using the official
[`svix`](https://www.npmjs.com/package/svix) SDK (OpenMeter delivers webhooks via Svix).

## Prerequisites

- Node.js 18+
- An OpenMeter webhook notification channel and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your channel's signing secret to `.env.local` as `OPENMETER_WEBHOOK_SECRET`.
   If you set a custom secret on the channel, keep the `whsec_` prefix.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/openmeter`

## Test

Run the test suite (generates real Svix-style signatures):

```bash
npm test
```

To receive real OpenMeter webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 openmeter --path /webhooks/openmeter
```

Use the printed URL as the `url` of your OpenMeter webhook channel and attach
the channel to a notification rule.

## Events Handled

- `entitlements.balance.threshold`
- `entitlements.reset`
- `invoice.created`
- `invoice.updated`

## Project Structure

```
├── app/
│   └── webhooks/
│       └── openmeter/
│           └── route.ts    # Webhook handler (reads raw body with request.text())
├── test/
│   └── webhook.test.ts     # Signature verification tests
├── vitest.config.ts
└── package.json
```
