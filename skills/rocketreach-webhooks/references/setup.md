# Setting Up RocketReach Webhooks

## Prerequisites

- A RocketReach account with API access
- Your application's webhook endpoint URL (for example `https://example.com/webhooks/rocketreach`)

## Create the Webhook

1. Open your RocketReach **API Usage & Settings** page.
2. Enter your webhook's URL, check the endpoints you want to enable, and click **Create**.
3. Make sure the webhook is enabled, then click **Test Webhook** to verify the connection.

## Generate the Webhook Secret

1. On the same page, find your webhook and click **Generate Secret** (or **Regenerate Secret**).
2. Wait for the confirmation, then store the secret.
3. Set it as `ROCKETREACH_WEBHOOK_SECRET`. Use it as UTF-8 text; don't base64-decode it.

**Hookdeck setup:** generate a webhook secret in the RocketReach API settings and paste it into
the RocketReach source in Hookdeck. Without a secret, deliveries are unsigned and fail
verification.

## Send a Lookup That Uses the Webhook

Include the webhook's ID in the request:

```json
{ "id": 123456, "webhook_id": 1004 }
```

For Bulk People Lookup:

```json
{ "queries": [{ "id": 123456 }], "webhook_id": 1004 }
```

If you omit `webhook_id`, your top-most enabled webhook is used.

## Local Testing

```bash
npx hookdeck-cli listen 3000 rocketreach --path /webhooks/rocketreach
```

Use the URL the CLI prints as the webhook URL. Express examples read the body with
`express.raw({ type: '*/*' })` so any content type verifies.
