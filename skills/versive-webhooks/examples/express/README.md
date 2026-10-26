# Versive Webhooks - Express Example

Minimal example of receiving Versive webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Versive signs deliveries per Standard Webhooks with `svix-*` headers).

## Prerequisites

- Node.js 18+
- Versive organization with a webhook set up by Versive support, and its endpoint signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Versive endpoint signing secret to `.env` as `VERSIVE_WEBHOOK_SECRET`. Versive support
   hands it over when they set up your organization's webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/versive
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
npx hookdeck-cli listen 3000 versive --path /webhooks/versive
```

1. Ask Versive support to point your organization's webhook at the tunnel URL (webhooks are
   provisioned by Versive, not self-serve).
2. Copy the endpoint's signing secret they give you into `.env`.
3. Complete an interview in a study to receive a real `interview.completed` delivery.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `interview.completed` (the only documented event; the list may not be exhaustive)

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
