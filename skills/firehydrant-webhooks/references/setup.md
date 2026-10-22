# Setting Up FireHydrant Webhooks

## Prerequisites

- FireHydrant account with **Owner** permissions (required to access webhook settings)
- Your application's webhook endpoint URL (use `npx hookdeck-cli listen` for local development)

## Register Your Endpoint and Set the Secret

1. In FireHydrant, go to **Settings** → **Webhooks**.
2. Click **+ Add webhook**.
3. Fill in the fields:
   - **URL** — your endpoint, for example `https://example.com/webhooks/firehydrant`. Each webhook sends to a single URL; create several webhooks for several destinations.
   - **Secret** — a value you choose. Store the same value in `FIREHYDRANT_WEBHOOK_SECRET`. FireHydrant uses it to sign every request.
   - **Status** — **Active** (set **Inactive** to pause without deleting).
   - **Event Subscriptions** — Change Events, Incidents, Incidents (Private), Signals (BETA).
4. Click **Add webhook**.

Private incidents are only delivered if you tick **Incidents (Private)**.

## Local Development

```bash
npx hookdeck-cli listen 3000 firehydrant --path /webhooks/firehydrant
```

Paste the Hookdeck URL as the webhook **URL**. Then change an incident or create a change
event in FireHydrant to trigger a delivery.

## Testing

FireHydrant has no "send test event" button in its docs. Trigger a real event instead
(update an incident, create a change event through the API, or create a Signals alert).
For local testing you can generate a valid signature yourself:

```bash
BODY='{"data":{},"event":{"operation":"UPDATED","resource_type":"incident"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$FIREHYDRANT_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/firehydrant \
  -H "Content-Type: application/json" -H "fh-signature: $SIG" -d "$BODY"
```
