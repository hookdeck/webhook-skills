# Setting Up BVNK Webhooks

## Prerequisites

- A BVNK account with access to the BVNK Portal
- A publicly reachable HTTPS endpoint on port 443 (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. In the BVNK Portal, open **Integrations** → **Webhooks** and create a webhook.
2. Enter the **Webhook URL to receive events** (the Hookdeck source URL, or your own `/webhooks/bvnk` route). It must be HTTPS on port 443; custom ports are not supported.
3. Select the **events to send**, for fiat and crypto operations.
4. Save. BVNK shows the secret in the **Public Key** field.

Most events are enabled by default. Contact the BVNK Solutions team to enable `bvnk:payment:channel:transaction-on-hold` and `bvnk:payment:crypto:transaction-on-hold`.

## Get Your Signing Secret

Paste the secret shown in the webhook's Public Key field in BVNK. Legacy BVNK webhooks (statusChanged events) sign differently and fail verification.

Set it as `BVNK_WEBHOOK_SECRET`. It looks like base64, but it is used as its UTF-8 string bytes, exactly as shown (no decoding, no extra whitespace). The field is labelled "Public Key" even though it is the HMAC secret.

## Authentication

Authentication is the `x-signature` header alone. There is no API key or basic auth from BVNK on incoming webhooks.

## Delivery Behavior

- Return `200` within 10 seconds, then do the work.
- Retries use growing delays capped at 15 minutes, up to 100 attempts.
- Duplicates are possible: deduplicate on `eventId`.

## Local Development

```bash
npx hookdeck-cli listen 3000 bvnk --path /webhooks/bvnk
```

Use the Hookdeck URL as the webhook URL in the BVNK Portal.
