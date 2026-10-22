# Setting Up Yapily Webhooks

Yapily webhooks are registered through the API, not a dashboard form.

## Prerequisites

- A Yapily application, with the Webhooks product enabled (Private Beta; contact your Customer Success Manager)
- Your application's ID and secret, used as Basic Auth credentials for the API
- A public HTTPS endpoint with a valid certificate. The URL must not contain query parameters

## How Do I Get the Webhook Secret?

1. List the available categories: `GET /webhook/events/categories`
2. Register the webhook: `POST /webhook/events` with `categories` (one or more), `callbackUrl.main.url`, optional `callbackUrl.backup.url`, and optional `metadata`
3. Read `webhookSecret` from the 201 response and store it as `YAPILY_WEBHOOK_SECRET`

**This is the only call that returns the secret.** You cannot retrieve it later; if it is lost or compromised, reset it.

## Register Your Endpoint

```bash
curl -X POST https://api.yapily.com/webhook/events \
  -u "$YAPILY_APPLICATION_UUID:$YAPILY_APPLICATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "categories": ["<category from GET /webhook/events/categories>"],
    "callbackUrl": { "main": { "url": "https://example.com/webhooks/yapily" } },
    "metadata": { "env": "production" }
  }'
```

Limits: up to 10 webhooks per application (more returns 406), no query parameters in the callback URL (400), metadata under 10kB (400). For sub-applications (Reseller & Merchants), send the `sub-application` header and use the sub-application ID.

## Manage Webhooks

- List: `GET /webhook/events`
- Delete: `DELETE /webhook/events/{webhook_id}`
- Reset secret: `POST /webhook/secrets/{webhook_id}`. Optionally supply a delay; for that period Yapily sends both `webhook-signature` and `webhook-rotation-signature` so you can switch secrets with no downtime.

## Test Mode vs Live Mode

Use the Yapily sandbox (for example the `mock-sandbox` institution) to generate payment events before going live. Webhooks are registered per application, so register separately for each environment.

## Local Development

```bash
npx hookdeck-cli listen 3000 yapily --path /webhooks/yapily
```

Register the Hookdeck URL it prints as the callback URL.
