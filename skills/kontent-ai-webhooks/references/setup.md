# Setting Up Kontent.ai Webhooks

## Prerequisites

- A Kontent.ai project with the Manage development settings permission
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Create the Webhook

1. In Kontent.ai, go to **Environment settings > Webhooks** and click **Create new webhook**.
2. Enter a name and your URL.
3. (Optional) Add custom headers under **Settings > Headers**.
4. Under **Triggers**, choose **Published data** or **Preview data**, then all events or specific events (with filters).
5. Save.

You can also create webhooks with the Management API.

## 2. Copy the Secret

Open the webhook's **Settings > Secret** and copy it into `KONTENT_AI_WEBHOOK_SECRET` exactly as shown. Each webhook has its own Secret.

## 3. Trigger a Notification

Publish or change content that matches the webhook's triggers. Notifications can take a few minutes to arrive.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 kontent-ai --path /webhooks/kontent-ai
```

Use the printed URL as the webhook URL.

## Using Hookdeck

Create a source with the **Kontent.ai** source type and paste the webhook's Secret as-is. Hookdeck verifies `X-Kontent-ai-Signature`. Webhooks that only send the legacy `X-KC-Signature` aren't covered: create a new webhook. Verification is optional on the source, and Hookdeck applies no timestamp window.
