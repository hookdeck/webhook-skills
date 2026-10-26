# Nomod Webhooks - Express Example

Minimal example of receiving Nomod webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Nomod delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- A Nomod webhook (Owner or Admin role) and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Nomod signing secret to `.env` as `NOMOD_WEBHOOK_SECRET`. Copy it from
   Settings > Tools & customisations > Apps & APIs > Webhooks > your webhook > Signing secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/nomod
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
npx hookdeck-cli listen 3000 nomod --path /webhooks/nomod
```

1. In Nomod go to Settings > Tools & customisations > Apps & APIs > Webhooks > Create webhook.
2. Pick an integration type (Nomod API or Nomod Hosted Checkout) and the `charge.*` events you want.
3. Enter the tunnel URL as the webhook URL and create the webhook.
4. Copy the webhook's **Signing secret** into `.env`.

## Event Handling

The handler reads the event name from the top-level `type` field of the body
(`{type, eventId, objectId, data}`), routes these events, and acknowledges anything else with `200`:

- `charge.created`, `charge.authorised`, `charge.completed`, `charge.failed`
- `charge.cancelled`, `charge.refunded`, `charge.partially_refunded`, `charge.dispute.created`

`eventId` identifies the event (use it to ignore repeated deliveries) and `objectId` is the charge
(`ch_...`).

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
