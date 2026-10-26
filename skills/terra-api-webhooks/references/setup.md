# Setting Up Terra API Webhooks

## Prerequisites

- A Terra account with access to the dashboard
- A public HTTPS endpoint (during development, use the Hookdeck CLI tunnel below)

## How Do I Get My Terra Signing Secret?

1. Open the Terra dashboard and go to the **Connections** page.
2. Find your webhook destination. It has **one signing secret per destination**.
3. Copy it into `TERRA_WEBHOOK_SECRET`. Use it as-is: the HMAC key is the secret's UTF-8 bytes, not a hex- or base64-decoded value.

## How Do I Register My Endpoint?

1. In the Terra dashboard, add a **webhook** data destination (see [Terra's webhook setup docs](https://docs.tryterra.co/health-and-fitness-api/integration-setup/setting-up-data-destinations/webhooks) for the current screens).
2. Enter your endpoint URL (for example `https://example.com/webhooks/terra-api`).
3. Keep the destination's signing secret for your environment.

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

Create a Hookdeck source of type **Terra API** and point your Terra destination at it. Hookdeck verifies `terra-signature` for you (HMAC-SHA256, hex, `<t>.<body>`) and applies no timestamp tolerance, so retries and replays still pass.
