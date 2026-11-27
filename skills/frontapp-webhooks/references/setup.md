# Setting Up Front Webhooks

## Prerequisites

- A Front account with access to build a Front **app** (partner / Core API app), or admin
  access to configure rule webhooks.
- Your application's publicly reachable webhook endpoint URL (e.g.
  `https://your-domain.com/webhooks/frontapp`). For local development, use a tunnel — see
  "Local Development" below.

## Application Webhooks (recommended)

Application webhooks are configured on a Front app, retry failed deliveries and are the
webhook system this skill implements.

### 1. Add a Webhook Feature to Your App

1. On the Developers page in Front, open (or create) your app.
2. Open the **Features** tab, click **Add feature**, then **Webhook**.
3. Enter your endpoint as the **Webhook URL** (or pick a **Webhook Server** if you want
   per-customer credentials), and under **Subscribed events** pick the events you need (e.g.
   `inbound_received`, `outbound_sent`, `conversation_moved`, `assignee_changed`, `tag_added`,
   `new_comment_added`, `message_delivery_failed`).
4. Your server must already be live: saving the feature triggers the validation request
   described below.

### 2. Get Your Signing Key

Front signs each request with your **application signing key**. Its verification steps call
it the token provided during webhook configuration, and its Python example names it the
application secret (apps show an **App secret** on their **Settings** tab). Store it as
`FRONT_WEBHOOK_SECRET` in your environment. Never commit it.

### 3. The Subscription Validation Challenge

When you register or update the subscription, Front sends a **validation request** to your
endpoint containing an `X-Front-Challenge` header. Your endpoint must respond within
**10 seconds** with HTTP `200` and echo the challenge value, using any of:

- `Content-Type: text/plain` with the challenge value as the body
- `Content-Type: application/x-www-form-urlencoded` with `challenge=<value>`
- `Content-Type: application/json` with `{"challenge": "<value>"}`

The examples in this skill detect the `X-Front-Challenge` header and reply automatically.

### 4. Delivery, Retries & Auto-Disable

- Front expects a `2xx` acknowledgement within **5 seconds**.
- On `408`, `429`, `500`, or a timeout, Front **retries up to 3 times**.
- If deliveries keep failing, Front **automatically disables** the webhook.

Acknowledge fast (return `200` immediately) and do heavy processing asynchronously.

## Rule Webhooks

Rule webhooks are configured as a rule action, not on an app, and use a **different**
verification scheme (HMAC-**SHA1**, base64, over the body only, keyed with the "API Secret"
from the Webhooks app, 5s timeout, **no retries**). Useful for quick testing but not the
target of this skill's examples.

1. Set up the rule's webhook action as described in Front's help center
   ([Rule webhooks](https://dev.frontapp.com/docs/rule-webhooks)), choosing the full event or
   an event preview.
2. Get the **API secret**: in Front, click **Settings**, then under **Company** click
   **App store**, open the **Webhooks** app, click **Configure app** and copy the API secret.

## Local Development

Front must reach your endpoint over HTTPS. Create a Front source in Hookdeck Event Gateway
(source type **Front**, with your app's signing key), then forward it to localhost with the
Hookdeck CLI, where `frontapp` is the source's name:

```bash
npx hookdeck-cli listen 3000 frontapp --path /webhooks/frontapp
```

Use the source's URL as the Webhook URL in your Front app.

## Documentation

- [Front Webhooks](https://dev.frontapp.com/docs/webhooks-1)
- [Front Application Webhooks & verification](https://dev.frontapp.com/docs/application-webhooks)
