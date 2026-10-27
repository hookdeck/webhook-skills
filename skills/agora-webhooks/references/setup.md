# Setting Up Agora Webhooks

## Prerequisites

- An Agora account and project
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## Get Your Signing Secret

1. Open Agora Console and go to your project's **Webhooks** (Notifications) settings.
2. Click **New Webhook**; the **Signing Secret** is shown when you create it.
3. Store it as `AGORA_WEBHOOK_SECRET`. It is used as-is, as UTF-8 bytes (not hex- or base64-decoded).

## Register Your Endpoint

1. Enter your URL, for example `https://example.com/webhooks/agora`.
2. Select the product (RTC) and the event types to receive (for example 101-104).
3. Save. Agora may validate the URL, so make sure the endpoint is live and answers `200` with a JSON body.

## Test Locally

```bash
npx hookdeck-cli listen 3000 agora --path /webhooks/agora
```

Use the printed URL as the webhook URL in Agora Console.
