# Setting Up Hexclave Webhooks

## Prerequisites

- A Hexclave project
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Create a Hexclave Webhook Endpoint?

Hexclave's documentation says to create a webhook endpoint in the dashboard's **Webhooks** section.

1. Open the Webhooks section of the Hexclave dashboard.
2. Create an endpoint with your server URL, e.g. `https://example.com/webhooks/hexclave`.
3. Save. Hexclave then sends `POST` requests with a JSON payload to that URL.

No challenge or validation request is documented. Every event type arrives at the one URL; branch on the `type` field in the body.

## Where Do I Find the Webhook Secret?

Each endpoint has its own signing secret, in the endpoint details on the dashboard. Hexclave doesn't show its format, but the deliveries go through Svix, whose secrets are `whsec_`-prefixed. Store the full value:

```bash
HEXCLAVE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

The signing key is the base64-decoded part after `whsec_`. If the value doesn't start with `whsec_`, the examples answer 500 rather than verify with the wrong key.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 hexclave --path /webhooks/hexclave   # use 8000 for FastAPI
```

Use the printed URL as the endpoint URL. Hexclave's docs also suggest [Svix Playground](https://www.svix.com/play/) or [Webhook.site](https://webhook.site/) for inspecting deliveries.
