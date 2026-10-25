# Setting Up Canny Webhooks

## Prerequisites

- A Canny account with access to **Your Subdomain > Settings > API**
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

## How Do I Add a Canny Webhook?

1. Open **Your Subdomain > Settings > API** in Canny.
2. Add a webhook with your URL, for example `https://your-app.com/webhooks/canny`.
3. Create a post, comment or vote to trigger an event.

Your signing secret appears on the same settings page once you have added a webhook.

## Where Do I Get the Canny Webhook Signing Secret?

Copy the `whsec_...` signing secret from the API settings page into `CANNY_WEBHOOK_SECRET`. Pass the whole value, including `whsec_`, to the Standard Webhooks library. The manual verifier strips the prefix and base64-decodes the rest.

## How Do I Rotate the Signing Secret?

When you regenerate the secret, Canny signs each request with both the old and new secret for 24 hours, so `webhook-signature` holds two space-separated `v1,` entries. Update your server within that window. Accept a request if any entry matches (the official libraries already do). If the old secret leaked, you can revoke it immediately instead.

## What Are the canny-timestamp, canny-nonce and canny-signature Headers?

Teams that used webhooks before signing secrets were introduced also receive these. They are legacy and will be removed. The signature covers only the nonce, signed with your API key, so it protects neither the body nor the timestamp. Ignore them and switch to `webhook-signature`.

## Local Development

```bash
npx hookdeck-cli listen 3000 canny --path /webhooks/canny
```

Use port `8000` for FastAPI. Add the printed URL as the webhook URL in Canny's API settings.
