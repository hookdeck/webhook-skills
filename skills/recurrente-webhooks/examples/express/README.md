# Recurrente Webhooks - Express Example

Minimal example of receiving Recurrente webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Recurrente delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Recurrente account with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Recurrente signing secret to `.env` as `RECURRENTE_WEBHOOK_SECRET`. It is returned once as
   `signingSecret` when you create the endpoint with `POST /api/webhook_endpoints`, and is always available in
   the Svix dashboard reachable from Configuración > Desarrolladores y API > Webhooks.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/recurrente
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
npx hookdeck-cli listen 3000 recurrente --path /webhooks/recurrente
```

1. Register the tunnel URL as a webhook endpoint in Configuración > Desarrolladores y API > Webhooks.
2. Copy the endpoint's signing secret into `.env`.
3. Pay a Sandbox checkout with card `4242 4242 4242 4242` to trigger `intent.succeeded`, or use the Testing tab of the webhook dashboard.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `intent.succeeded`, `intent.pending`, `intent.failed`, `intent.canceled`, `intent.paid`
- `subscription.create`, `subscription.past_due`, `subscription.pause`, `subscription.unpause`, `subscription.reactivate`, `subscription.update`, `subscription.item_added`, `subscription.item_removed`, `subscription.invoice_item_added`, `subscription.cancel`
- `setup_intent.succeeded`, `setup_intent.cancelled`
- `refund.create`, `dispute.create`, `dispute.update`
- `verification.completed`, `verification.rejected`, `tax_invoice_settings.enabled`, `account_connection.create`
- `transfer.sent`, `transfer.received`, `withdrawal.create`, `withdrawal.update`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
