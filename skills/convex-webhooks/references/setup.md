# Setting Up Convex Webhook Log Streams

## Prerequisites

- A Convex **Pro plan** (log streams require it)
- A public HTTPS endpoint URL (your server, or a Hookdeck source URL)

## Register Your Webhook

1. Open the [Deployment Settings](https://dashboard.convex.dev/deployment/settings) of the deployment in the Convex dashboard and select the **Integrations** tab.
2. Choose the **Webhook** card (webhook to a custom URL).
3. Enter your endpoint URL.
4. Choose a **Format**: JSONL (one object per line, preselected) or JSON (one array per request). Both are sent as `Content-Type: application/json`.
5. Optionally pick **Topics**. With none picked the stream gets every topic except the opt-in `custom_audit`, including topics Convex adds later.
6. Copy the **HMAC secret** the dashboard shows after you create the stream; keep it as `CONVEX_WEBHOOK_SECRET`.

Convex then streams events, starting with a `verification` event. To stop delivery, delete the integration from its card menu.

Regenerating the secret in the stream's settings (or with the Deployment API) invalidates the old one immediately, so update your receiver at the same time.

## Use with Hookdeck

Set the webhook URL to your Hookdeck source URL and the format to **JSON**, so each request is one JSON array. Then use the HMAC secret for the Hookdeck source's verification (Convex source type). For local development:

```bash
npx hookdeck-cli listen 3000 convex --path /webhooks/convex
```

## Per-Deployment Streams

Log streams are configured per deployment, so a dev and a prod deployment each need their own webhook (and have their own secret).
