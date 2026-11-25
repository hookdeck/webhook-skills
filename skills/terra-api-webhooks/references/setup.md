# Setting Up Terra API Webhooks

## Prerequisites

- A Terra account with access to the dashboard
- A public HTTPS endpoint (during development, use the Hookdeck CLI tunnel below)

## How Do I Get My Terra Signing Secret?

1. Open the Terra dashboard and go to the **Connections** page.
2. Click the key icon on your webhook and copy **Signing secret**. Each webhook has its own; a webhook created before per-webhook secrets may still use your environment's shared secret until you rotate it.
3. Copy it into `TERRA_WEBHOOK_SECRET`. Use it as-is: the HMAC key is the secret's UTF-8 bytes, not a hex- or base64-decoded value.

## How Do I Register My Endpoint?

1. On the Terra dashboard's **Connections** page, click **Add New** and choose Webhook (see [Terra's webhook docs](https://docs.tryterra.co/destinations/webhooks)). The Admin API and the Terra CLI can also create it and return the signing secret once.
2. Enter your endpoint URL (for example `https://example.com/webhooks/terra-api`).
3. Keep the webhook's signing secret. Rotation (dashboard, Admin API or Terra CLI) takes effect at once, with no overlap.

Terra sends `POST` requests with a JSON body. Your endpoint must answer with a `2xx` within 8 seconds.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 terra-api --path /webhooks/terra-api
```

Use the Hookdeck URL as the destination URL in the Terra dashboard. The CLI needs no account and shows each request in a local web UI.

## Environment Variables

```bash
TERRA_WEBHOOK_SECRET=your_terra_signing_secret
TERRA_WEBHOOK_TOLERANCE_SECONDS=0   # optional replay window; 0 or unset = off
```

## Using Hookdeck in Production

Create a Hookdeck source of type **Terra API** and point your Terra destination at it. Hookdeck verifies the signature for you.
