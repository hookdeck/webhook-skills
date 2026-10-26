# Setting Up Violet Webhooks

## Prerequisites

- A Violet channel app with its App ID and **app secret**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 violet --path /webhooks/violet` for local development)

## Get Your Signing Secret

Violet signs webhooks with your **app secret**, the same value you send as `X-Violet-App-Secret` on API calls. There is no per-webhook secret. Find it on the overview page of your channel dashboard. Test Mode and Live Mode use **different** app secrets, so verify with the secret that matches the environment sending the webhook. Store it as `VIOLET_WEBHOOK_SECRET` and use it as-is, as UTF-8 text (a 32-character hex string is still used as text, never hex-decoded).

## Register Your Endpoint

Webhooks are created per event through the REST API:

```bash
curl -X POST https://sandbox-api.violet.io/v1/events/webhooks \
  -H "X-Violet-App-Id: your-app-id-here" \
  -H "X-Violet-App-Secret: your-app-secret-here" \
  -H "X-Violet-Token: your-token-here" \
  -H "Content-type: application/json" \
  -d '{"event": "ORDER_SHIPPED", "remote_endpoint": "https://example.com/webhooks/violet"}'
```

Create one webhook for each event you want (for example `ORDER_COMPLETED`, `ORDER_SHIPPED`, `MERCHANT_CONNECTED`). Several events can point at the same endpoint, because the `X-Violet-Topic` header names each delivery.

Live Mode uses `https://api.violet.io` instead of the sandbox host `sandbox-api.violet.io`. The API can also list, modify, re-activate and remove webhooks (see [Managing Webhooks](https://docs.violet.io/prism/webhooks/managing-webhooks)).

## Custom Headers

Webhook headers let you add your own headers to every delivery (for example a shared token), through `POST /v1/events/webhooks/{webhook_id}/headers`. They are separate from the signature, which is always sent.

## Test Your Endpoint

Violet can simulate an event to a webhook you are already subscribed to: `POST /v1/apps/{app_id}/webhooks/{webhook_id}/simulate` with the related id in the body (`order_id` for order events, `merchant_id` for merchant events, and so on). See [Simulating Webhook Events](https://docs.violet.io/prism/webhooks/simulating-webhook-events). Use the sandbox environment while developing.

## Keep the Webhook Active

Repeated failures pause and then disable a webhook (see `overview.md`). If a webhook is `DISABLED`, fix the endpoint and re-activate it through the API.
