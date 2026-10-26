# Celitech Webhooks - Next.js Example

Minimal example of receiving Celitech webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Celitech delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Celitech account with webhooks enabled (Celitech enables them per account on request) and an endpoint signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Celitech signing secret to `.env` as `CELITECH_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/celitech
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Celitech uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including a delivery sent with `webhook-*` headers instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 celitech --path /webhooks/celitech
```

1. In Celitech, go to **Developers → Webhooks** and add an endpoint with the tunnel URL.
2. Copy the endpoint's signing secret into `.env`.

## Event Handling

The handler routes these events (the body is flat, with `type` at the top level) and logs anything else:

- `consumption.threshold.reached`
- `esim.downloaded`
- `esim.installed`
- `esim.enabled`
- `esim.disabled`
- `esim.deleted`

The raw body is read with `await request.text()`, so the exact bytes are verified
whatever the content type, and JSON is parsed only after the check passes.

The `svix` library always enforces a 5-minute timestamp window. Hookdeck retries and replays
resend the original timestamp, so late retries are rejected; see the skill's
`references/verification.md` for a manual verifier where the window can be dropped.
