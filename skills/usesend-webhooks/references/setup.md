# Setting Up useSend Webhooks

## Prerequisites

- A useSend account (usesend.com or your self-hosted instance)
- A public HTTPS URL for your endpoint. Locally, use the Hookdeck CLI.

## Get Your Signing Secret

1. Open **Webhooks** in the useSend dashboard.
2. Create a webhook (or open an existing one).
3. Copy the signing secret.

> Paste the whole secret, including the whsec_ prefix. useSend uses it as a plain HMAC key.

Set it as `USESEND_WEBHOOK_SECRET` exactly as shown. Do not strip `whsec_` and do
not base64-decode it.

## Register Your Endpoint

1. Go to **Webhooks** in the dashboard and create a new webhook.
2. Enter your endpoint URL, for example `https://example.com/webhooks/usesend`.
3. Select the events you want. Good starting points: `email.delivered`,
   `email.bounced`, `email.complained`, `contact.created`, `domain.verified`.
4. Save and copy the signing secret.

The endpoint must accept `POST` with a JSON body, return a `2xx` and respond
within 10 seconds.

## Local Development

```bash
npx hookdeck-cli listen 3000 usesend --path /webhooks/usesend
```

Use port `8000` for FastAPI. Put the Hookdeck URL it prints in the useSend
dashboard.

## Send a Test Event

Open the webhook in the dashboard and click **Send Test**. The event has type
`webhook.test` and the body `{"test": true, "webhookId": "...", "sentAt": "..."}`.

## Re-enabling a Webhook

After 30 consecutive failed calls useSend disables the webhook. Fix the
endpoint, then re-enable it from the dashboard. The failure counter resets on the
next successful delivery.
