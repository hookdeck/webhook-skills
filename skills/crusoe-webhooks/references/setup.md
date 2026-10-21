# Setting Up Crusoe Cloud Webhooks

## Prerequisites

- A Crusoe Cloud organization and access to the [Crusoe Cloud Console](https://console.crusoecloud.com/)
- A publicly reachable HTTPS endpoint (for local development, a Hookdeck CLI tunnel)

## How Do I Add a Crusoe Webhook Endpoint?

From [Crusoe's docs](https://docs.crusoecloud.com/notifications/overview#configure-webhook-notifications):

1. In the console, click the **bell icon** in the top-right corner.
2. Click **All Notifications**, then **Manage Slack/Webhook** in the top-right corner. This opens the Svix dashboard in a separate page.
3. Click **Add Endpoint**.
4. Select **Webhook** as the endpoint type.
5. Enter your endpoint URL, e.g. `https://example.com/webhooks/crusoe`.
6. Select the event types to subscribe to.
7. Click **Create**.

Some event types send no email by default; turn them on in
[Notification Settings](https://console.crusoecloud.com/notifications/settings).
Budget alerts are created under **Admin → Billing → Alerts** (admin or editor role).

## Where Do I Find the Signing Secret?

Crusoe doesn't document this step. In the standard Svix dashboard, open the endpoint
you created and reveal **Signing Secret**; it starts with `whsec_`. Store it as:

```bash
CRUSOE_WEBHOOK_SECRET=whsec_xxxxx
```

Each endpoint has its own secret. Rotating it in the dashboard sends signatures for
both the old and new secret for a while; the `svix` SDK accepts either.

## How Do I Test Locally?

```bash
npx hookdeck-cli listen 3000 crusoe --path /webhooks/crusoe   # Express / Next.js
npx hookdeck-cli listen 8000 crusoe --path /webhooks/crusoe   # FastAPI
```

Use the printed URL as the endpoint URL, then send a sample from the endpoint's
**Testing** tab in the Svix dashboard. Sample events from Svix may not match the shape
of real Crusoe notifications, so log the first real payloads you receive.
