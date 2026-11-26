# Setting Up Strike Webhooks

Strike (strike.me, Bitcoin/Lightning payments) webhook subscriptions are created **through the API**, not in a dashboard form. You need an API key to create the subscription, and a secret that you generate yourself to verify deliveries.

## Prerequisites

- A Strike account with access to the Strike Dashboard (dashboard.strike.me)
- A public **HTTPS** endpoint (or a Hookdeck URL, see below)
- Ideally the Strike **Sandbox** (docs.strike.me/sandbox) first: simulated cash balances and testnet bitcoin, so you can trigger real events without moving money. The sandbox has its own dashboard (https://dev.dashboard.strike.me), its own API (https://api.dev.strike.me) and its own API keys; production keys don't work there

## 1. Create an API Key

In the Strike Dashboard, create an API key with the scopes your integration needs: `partner.webhooks.manage` for the subscription endpoints (`/v1/subscriptions`) and for `GET /v1/events`, plus read access to whatever your fetch-back calls (`GET /v1/invoices/{id}`, `GET /v1/payouts/{id}`, ...). Authorize every API request with:

```
Authorization: Bearer <STRIKE_API_KEY>
```

The API key is **not** the webhook signing key. Store it as `STRIKE_API_KEY`.

## 2. Generate the Webhook Secret Yourself

Strike doesn't issue a signing secret. You choose it and send it when you create the subscription. Strike's docs: "The `secret` can be any arbitrary string, ranging from 10 to 50 characters long, and should be kept safe and private." Generate a strong random one:

```bash
openssl rand -hex 24   # 48 hex characters, inside the 10-50 limit
```

Store it as `STRIKE_WEBHOOK_SECRET`. This is the HMAC key for `X-Webhook-Signature`.

## 3. Create the Subscription

`POST /v1/subscriptions`. All five fields are required; `eventTypes` needs at least one entry:

```bash
curl -X POST https://api.strike.me/v1/subscriptions \
  -H "Authorization: Bearer $STRIKE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://example.com/webhooks/strike",
    "webhookVersion": "v1",
    "secret": "'"$STRIKE_WEBHOOK_SECRET"'",
    "enabled": true,
    "eventTypes": ["invoice.created", "invoice.updated"]
  }'
```

- Pin `webhookVersion` to `v1`. It's the only payload shape Strike documents (the API also accepts `v2`, whose differences are undocumented as of 2026-11-20).
- Use exact event names from [overview.md](overview.md). OAuth scope strings such as `invoice.read` are not event types.
- One URL can take many event types, or you can create up to 50 endpoints for specific events.

## 4. Handle Deliveries

Verify `X-Webhook-Signature`, return `2xx` within 5 seconds, then fetch the entity by `data.entityId`. See the examples.

## Managing Subscriptions

| Call | Use |
|---|---|
| `GET /v1/subscriptions` | List subscriptions |
| `GET /v1/subscriptions/{subscriptionId}` | Read one |
| `PATCH /v1/subscriptions/{subscriptionId}` | Change the URL, event list, `enabled` or `secret` (every field optional) |
| `DELETE /v1/subscriptions/{subscriptionId}` | Remove it |

`"enabled": false` pauses deliveries without deleting the subscription.

## Rotating the Secret

`PATCH /v1/subscriptions/{subscriptionId}` with a new `secret`. Strike documents no overlap window and doesn't sign with two secrets, so a delivery or retry already in flight may still carry the old signature. Operational advice (not a Strike feature): before the PATCH, deploy with `STRIKE_WEBHOOK_SECRET=<new>` and `STRIKE_WEBHOOK_SECRET_PREVIOUS=<old>`; the examples accept either. Remove the old one once retries have drained. If the secret leaks, rotate immediately.

## Testing

- **Sandbox:** create a sandbox API key in the Sandbox Dashboard (https://dev.dashboard.strike.me; sandbox keys are separate from production keys), create the subscription with `POST https://api.dev.strike.me/v1/subscriptions`, and trigger events by creating invoices or payments there. Set `STRIKE_API_BASE=https://api.dev.strike.me` so the fetch-back calls go to the same environment.
- **Inspect raw deliveries:** Strike's docs suggest the API Explorer plus RequestBin/Webhook.site for a first event. The Hookdeck CLI does the same and forwards to your local server:

```bash
npx hookdeck-cli listen 3000 strike --path /webhooks/strike   # 8000 for FastAPI
```

Use the printed URL as `webhookUrl`.

## Using Hookdeck in Front of Strike

Create a Hookdeck source of type **Strike** (`STRIKE`), configure its verification with your subscription secret, and set the subscription's `webhookUrl` to the Hookdeck source URL. Hookdeck acknowledges Strike inside the 5-second window and delivers to your handler with its own retries.

## Missed Events

If your endpoint was down past the 12 retries (about 9 days), replay from `GET /v1/events`, which holds 30 days of events. See [overview.md](overview.md#recovering-missed-events-get-v1events).
