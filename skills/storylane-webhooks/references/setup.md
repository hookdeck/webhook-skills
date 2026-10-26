# Setting Up Storylane Webhooks

## Prerequisites

- A Storylane account on the **Starter plan or above**
- Your endpoint URL (use `npx hookdeck-cli listen 3000 storylane --path /webhooks/storylane` locally)

## Register Your Endpoint

1. In Storylane, open **Settings > Alerts** and create or edit a demo alert.
2. Choose the webhook destination and enter your endpoint URL.
3. Use the **Test webhook** button to send a sample `demo_viewed` delivery.

## Get Your Webhook Verification Secret

Storylane signs every request with your **Webhook Verification Secret**. Its docs don't say where
it is shown or whether it is per alert or per account: look in the webhook/alert settings. Store it
as `STORYLANE_WEBHOOK_SECRET` and treat it like a password. Use it as-is (its UTF-8 bytes), not
hex- or base64-decoded.

## Setup with Hookdeck

Paste the Webhook Verification Secret into the Hookdeck source's webhook verification settings
(Storylane source: HMAC-SHA256, header `x-storylane-signature`, base64).

## Local Development

```bash
npx hookdeck-cli listen 3000 storylane --path /webhooks/storylane
```

## Testing

Use the **Test webhook** button, or view a demo yourself. Deliveries are `POST` requests with a JSON
body and an `x-storylane-signature` header.
