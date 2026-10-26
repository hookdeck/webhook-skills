# Setting Up Convex Webhook Log Streams

## Prerequisites

- A Convex **Pro plan** (log streams require it)
- A public HTTPS endpoint URL (your server, or a Hookdeck source URL)

## Register Your Webhook

1. Open the [Deployment Settings](https://dashboard.convex.dev/deployment/settings) of the deployment in the Convex dashboard and select the **Integrations** tab.
2. Choose the **Webhook** card (webhook to a custom URL).
3. Enter your endpoint URL. It is the only required setting.
4. Copy the **HMAC secret** the dashboard shows when you configure the webhook; keep it as `CONVEX_WEBHOOK_SECRET`.

Convex then streams events, starting with a `verification` event. There is no event selection: every topic is sent. To stop delivery, delete the integration from its card menu.

## Use with Hookdeck

Set the webhook URL to your Hookdeck source URL, and use the same HMAC secret for the Hookdeck source's verification (Convex source type). For local development:

```bash
npx hookdeck-cli listen 3000 convex --path /webhooks/convex
```

## Per-Deployment Streams

Log streams are configured per deployment, so a dev and a prod deployment each need their own webhook (and have their own secret).
