# Tensorlake Webhooks - Express Example

Minimal example of receiving Tensorlake webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Tensorlake deliveries are signed by Svix per Standard Webhooks with `svix-*` headers).

## Prerequisites

- Node.js 18+
- Tensorlake Cloud project with a webhook destination and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Tensorlake signing secret to `.env` as `TENSORLAKE_WEBHOOK_SECRET`. You'll find it on
   the destination's page (project > **Webhooks** > destination > **Signing secret**) in Tensorlake Cloud.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/tensorlake
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 tensorlake --path /webhooks/tensorlake
```

1. Register the tunnel URL as a webhook destination on the project's **Webhooks** page in Tensorlake Cloud.
2. Copy the destination's signing secret into `.env`.
3. Use **Test webhook** on the destination's page to deliver a sample `tensorlake.sandbox.failed`.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `tensorlake.sandbox.created`, `.running`, `.suspended`, `.resumed`, `.terminated`, `.failed`
- `tensorlake.application.created`, `.updated`, `.deleted`
- `tensorlake.application.request.created`, `.completed`, `.failed`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
