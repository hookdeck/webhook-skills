# Setting Up Zoho Sign Webhooks

## Prerequisites

- Zoho Sign admin access on an Enterprise, API, Zoho One or People Plus plan
- A public HTTPS endpoint (use `npx hookdeck-cli listen` locally)
- Only two webhooks are allowed per account

## How Do I Register a Webhook?

1. In Zoho Sign go to **Settings > Developer Settings > Webhooks**.
2. Click **Create webhook** and enter a name and your callback URL.
3. Select the events to send.
4. To sign deliveries, enable the **HMAC signature** checkbox and enter a secret key of your
   own, or click **Generate**.
5. Save. **The secret cannot be retrieved afterwards**, so store it immediately as
   `ZOHO_SIGN_WEBHOOK_SECRET`. If you lose it, edit the webhook and set a new one.

## What Does Zoho Sign Send?

- `POST` with a JSON body (`notifications` and `requests`)
- With HMAC enabled: `X-ZS-WEBHOOK-SIGNATURE: <base64 HMAC-SHA256 of the raw body>`
- Without HMAC enabled, no signature header is sent and nothing can be verified. Enable it.

## Local Development

```bash
npx hookdeck-cli listen 3000 zoho-sign --path /webhooks/zoho-sign
```

Use port `8000` for FastAPI. Give the Hookdeck URL to Zoho Sign as the callback URL.

## Testing

Trigger a real event (send a test document for signature, then view or sign it) and check
the delivery in the Hookdeck web UI. Zoho Sign has no "send test event" button in the
documentation.
