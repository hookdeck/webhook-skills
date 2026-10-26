# Setting Up Sahha Webhooks

## Prerequisites

- A Sahha account with access to the [Dashboard](https://app.sahha.ai/dashboard/webhooks)
- A public **HTTPS** URL for your endpoint (use the Hookdeck CLI below for local development)

## How Do I Add a Sahha Webhook Endpoint?

1. Open the Sahha Dashboard and choose **Webhooks** in the sidebar.
2. Add your endpoint URL (must be HTTPS), for example `https://your-app.com/webhooks/sahha`.
3. Select the event types to receive: `ScoreCreatedIntegrationEvent`, `BiomarkerCreatedIntegrationEvent`, `ArchetypeCreatedIntegrationEvent`, `TagReceivedIntegrationEvent`, `DataLogReceivedIntegrationEvent`.
4. Copy the **secret key** and store it as `SAHHA_WEBHOOK_SECRET`.

## How Do I Set the Delivery Interval?

On the same page, set the webhook interval for scores and biomarkers: real-time, or 1 to 720 minutes. Within the interval, repeat updates for the same metric and profile are held and only the final value is sent. Data logs and tags ignore the interval.

## How Do I Test My Endpoint?

Use **Send Test Event** in the Dashboard. Test deliveries are signed the same way as real ones.

## Local Development

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 sahha --path /webhooks/sahha
```

Paste the printed URL as the endpoint in the Dashboard. If you use Hookdeck's Sahha source in production, its source verifies the signature with the same secret before forwarding.
