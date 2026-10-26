# Setting Up 1Password Device Trust (Kolide) Webhooks

## Prerequisites

- A 1Password Device Trust (Kolide) account where you have Full Access
- Your application's webhook endpoint URL (or a Hookdeck source URL)

## Get Your Signing Secret

1. In the admin console, go to Settings > Developers > Webhooks.
2. Open your webhook endpoint.
3. Choose "Reveal Secret" on the webhook settings screen and copy it.
4. Store it as `KOLIDE_WEBHOOK_SECRET`. It is a per-endpoint secret and is used as-is, as UTF-8 bytes: do not hex- or base64-decode it.

Rotating the secret also changes the `X-Kolide-Webhook-Identifier` header, so update your stored secret when you rotate.

## Register Your Endpoint

1. Go to Settings > Developers > Webhooks and add a webhook.
2. Enter your endpoint URL (the Hookdeck source URL if you use Hookdeck).
3. Subscribe to the events you handle, for example `devices.created`, `devices.registered`, `device_trust.status_changed`, `issues.new`, `issues.resolved`, `auth_logs.failure`.
4. Send the test event (`webhook.test`) to confirm your endpoint verifies the signature and returns `200`.

## Hookdeck Setup

Hookdeck's `KOLIDE` source type is labelled "1Password Device Trust (Kolide)". It verifies the signature with HMAC, SHA-256, header `authorization`, hex encoding, and posts to your destination. Paste the endpoint's signing secret into the source and use the source URL as the endpoint URL. For local development:

```bash
npx hookdeck-cli listen 3000 kolide --path /webhooks/kolide
```

## Testing

Use the `webhook.test` event from the admin console. The docs also list delivery logs, kept for six months, which show what was sent to your endpoint.
