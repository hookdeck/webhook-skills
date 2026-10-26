# Setting Up Basiq Webhooks

## Prerequisites

- A Basiq account and an application API key, to obtain a server access token
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

## How Do I Create a Basiq Webhook Subscription?

Subscriptions are managed through the API rather than a dashboard form.

1. Get a server access token with your API key.
2. `POST /notifications/webhooks` with the **URL** of your endpoint (for example `https://your-app.com/webhooks/basiq`) and the **events** you want, using event type IDs from `GET /events/types`. Basiq's webhooks page names these two inputs but the field names are in the API reference, so check them there.
3. Subscribe only to event types that endpoint lists.
4. A new subscription may take up to 15 minutes to start delivering.

## Where Do I Get the Basiq Webhook Signing Secret?

Each endpoint has one signing secret, in the form `whsec_` + base64 (for example `whsec_MA4V6bD7rB0Hcm2aw8ghgDeQ5UAak24DwnX0rX6`). Per Basiq, the signing secret is the part after the `whsec_` prefix, and that part is base64-decoded to get the HMAC key. Store the **full** value, including the prefix, as `BASIQ_WEBHOOK_SECRET`. See [webhook security](https://api.basiq.io/docs/webhooks-security).

## How Do I Send a Test Message?

Use `POST /notifications/messages/test` to have Basiq send a test message to your subscription. Delivered messages can be listed with `GET /notifications/webhooks/{webhookId}/messages`.

## Local Development

```bash
npx hookdeck-cli listen 3000 basiq --path /webhooks/basiq   # Express / Next.js
npx hookdeck-cli listen 8000 basiq --path /webhooks/basiq   # FastAPI
```

No account required. Use the printed URL as the subscription `url`.

## Challenge or Handshake

Basiq documents no endpoint challenge, so there is nothing to answer when you create a subscription.
