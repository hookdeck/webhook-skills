# Setting Up Samsara Webhooks

## Prerequisites

- A Samsara organization (customer account or a partner sandbox) with permission to manage webhooks
- An HTTPS endpoint (use the Hookdeck CLI locally)

## Add the Webhook

1. In the Samsara dashboard, open **Settings > Webhooks**.
2. Click **Add Webhook**, give it a name and enter your endpoint URL (for example `https://your-app.example.com/webhooks/samsara`).
3. Save. Samsara lists the webhook "along with a secret key".
4. Copy the **secret key** into `SAMSARA_WEBHOOK_SECRET`, exactly as shown. It's base64; your handler decodes it.

To get events:

- **Alerts:** in an alert's configuration, add the action that sends a webhook and choose this webhook.
- **Event Subscriptions:** subscribe the webhook to event types (Webhooks 2.0) in the dashboard or through the API.

## Test

Click **Test** on the webhook's configuration page. Samsara sends a signed `Ping`:

```json
{ "eventId": "...", "eventMs": 1731924900123, "eventType": "Ping", "event": { "text": "Ping" } }
```

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 samsara --path /webhooks/samsara
```

Use the printed URL as the webhook URL, click **Test**, and inspect the request and your handler's response in the CLI.

## Using Hookdeck

Create a source with the **Samsara** source type and paste the secret key exactly as Samsara shows it. Hookdeck decodes the base64 and verifies `X-Samsara-Signature` against `v1:<X-Samsara-Timestamp>:<body>`. Verification is optional on the source, and Hookdeck applies no timestamp window. Point the Samsara webhook at the source URL and add your handler as the destination.

## Rotating the Secret

If you regenerate the webhook's secret key in Samsara, update `SAMSARA_WEBHOOK_SECRET` (and the Hookdeck source) at the same time. Samsara signs with one key per webhook, so requests fail verification until both sides match.
