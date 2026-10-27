# Setting Up Cuuro Webhooks

## Prerequisites

- A Cuuro account with an API integration (Settings > Developers)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Cuuro Webhook URL?

Webhooks are configured per API integration:

1. In the Cuuro dashboard, open **Settings** > **Developers**.
2. Click an API integration to open its details page, then the **Webhooks** tab.
3. Click **Create Webhook**.
4. Enter the **URL** of your endpoint, e.g. `https://example.com/webhooks/cuuro`.
5. Select the **Events** to listen to (you can pick several): `startup.created`, `analysis.created`, `analysis.completed`.
6. Click **Create**.

No challenge or validation request is documented, so nothing needs to be echoed back.

## Where Do I Find the Webhook Secret?

Cuuro's page doesn't say where the signing secret is shown or what it looks like. Because Cuuro sends through Svix, the endpoint secret is a Svix signing secret of the form `whsec_<base64>`. Look for it on the webhook's entry in the integration's **Webhooks** tab, and ask Cuuro support if it isn't visible. Store the full value, prefix included:

```bash
CUURO_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

The signing key is the base64-decoded part after `whsec_`. If the value doesn't start with `whsec_`, the examples answer 500 rather than verify with the wrong key.

## Other Protections

Cuuro also suggests accepting requests only from [Svix's webhook IPs](https://docs.svix.com/webhook-ips.json). That is optional and does not replace signature verification.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 cuuro --path /webhooks/cuuro   # use 8000 for FastAPI
```

Use the printed URL as the webhook URL, then trigger an event, for example by creating a target company or an analysis through the Cuuro API.
