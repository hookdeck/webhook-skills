# Setting Up Mautic Webhooks

## Prerequisites

- A Mautic instance (self-hosted or hosted) and an administrator account
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Create the Webhook and Get Your Secret

1. Click the cog icon (top right) → **Webhooks**.
2. Click **New**.
3. Enter a **Name** and the **Webhook POST URL** (e.g. `https://example.com/webhooks/mautic`).
4. Select the **Events** that should trigger the webhook.
5. Under the secret field, keep the randomly generated default or set your own. Copy it: this exact string is `MAUTIC_WEBHOOK_SECRET`.
6. Click **Apply**.

Create one webhook per app or script so each has its own secret.

## Choose Real-Time or Queued Delivery

Cog icon → **Configuration** → **Webhook Settings** tab:

- **Queue Mode**: *Process Events Immediately* or *Queue Events Only - Process Via CLI Command*. Queued mode needs the [Webhooks cron job](https://docs.mautic.org/en/5.x/configuration/cron_jobs.html#webhooks-cron-job) to be running.
- **Order of the queued events**: chronological or reverse chronological.

## Test the Webhook

Edit the webhook and click **Send Test Payload**. Mautic sends an example request to your URL. You can also trigger a real event, such as submitting a form.

## Local Development

```bash
npx hookdeck-cli listen 3000 mautic --path /webhooks/mautic
```

Use the Hookdeck URL as the Webhook POST URL in Mautic.
