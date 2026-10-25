# Setting Up TheirStack Webhooks

## Prerequisites

- A TheirStack account
- A saved job search or company search (the webhook is built on a saved search)
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/theirstack`)

## Get Your Signing Secret

The signing secret is optional in TheirStack, but **without one deliveries are unsigned and fail verification**. Always set one.

1. In the webhook form, fill the **Signing Secret** field. It needs at least 16 characters; you can generate one in the app or provide your own.
2. Or via the API, send a `secret` field to `POST /v0/webhooks` or `PATCH /v0/webhooks/{id}`.
3. Store it as `THEIRSTACK_WEBHOOK_SECRET`. Never commit it.

## Register Your Endpoint

1. Open a job or company search and click **Save**.
2. Click **Webhooks**, then **Create Webhook**.
3. Choose the **Saved search**. Its filters decide which records trigger the webhook.
4. For job searches, optionally enable **Trigger once per company**.
5. Choose where to start: **From now on** (new events only) or **All time** (historical matches plus future events).
6. Enter the **Webhook URL** and the **Signing Secret**.
7. Click **Send test event** to check delivery.

## Using Hookdeck

Set a signing secret on the TheirStack webhook. Without one, deliveries are unsigned and fail verification. Use the same value as the signing secret on your Hookdeck source (or in your own receiver if you verify there).

For local development:

```bash
npx hookdeck-cli listen 3000 theirstack --path /webhooks/theirstack
```

Use the printed Hookdeck URL as the **Webhook URL**.

## Test Mode vs Live Mode

TheirStack has no separate test mode. **Send test event** posts a sample to your URL. Set a daily event limit on a webhook to cap spend while testing.
