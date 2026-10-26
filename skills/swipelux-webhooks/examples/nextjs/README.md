# Swipelux Webhooks - Next.js Example

Minimal example of receiving Swipelux webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Swipelux signs deliveries per Standard Webhooks with `svix-*` headers; Swipelux delivers new integrations through Svix).

## Prerequisites

- Node.js 18+
- Swipelux account with an API key that has `webhooks:write`, and a webhook endpoint with its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Swipelux signing secret to `.env` as `SWIPELUX_WEBHOOK_SECRET`. You'll find it on
   the Svix app portal: request a link with `GET /v3/webhooks/portal` (it expires after an hour), open it, and reveal this endpoint's secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/swipelux
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
npx hookdeck-cli listen 3000 swipelux --path /webhooks/swipelux
```

1. Register the tunnel URL with `POST /v3/webhooks` (`url` plus an `events` list such as `["transfer.state_changed"]`).
2. Copy the endpoint's signing secret into `.env`.
3. Trigger a change in sandbox (for example a transfer state change), or use the portal's replay, to deliver a real event.

## Event Handling

The handler reads the event name from the body's top-level `type` field, routes these
events, and acknowledges anything else with `200`:

- `customer.created`, `customer.updated`, `customer.archived`
- `capability.created`, `capability.status_changed`
- `application.status_changed`, `recipient.status_changed`, `destination.status_changed`
- `account.created`, `account.status_changed`, `account.details_changed`
- `transfer.state_changed`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
