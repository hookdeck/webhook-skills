# Setting Up Dolby OptiView Real-time (Millicast) Webhooks

## Prerequisites

- A Dolby OptiView Real-time (Millicast) account
- An HTTPS endpoint (use the Hookdeck CLI locally)

## Create the Webhook

1. In the Streaming Dashboard, open the **Webhooks** tab and click **CREATE**.
2. Enter the Webhook URL (for example `https://your-app.example.com/webhooks/millicast`) and turn on the hook types you want (Feed, Media, Thumbnail, Transcoder, ViewerConnection).
3. Save. Each webhook generates a **Webhook Secret**; copy it into `MILLICAST_WEBHOOK_SECRET`, exactly as shown. It's base64; your handler decodes it.

## Renew the Secret

Click **Renew** in the webhook's settings to rotate the secret. "Once you click to renew the secret this cannot be undone": the old secret stops working at once, so update `MILLICAST_WEBHOOK_SECRET` (and redeploy) at the same time.

## Test

With Feed hooks on, start publishing a stream from the dashboard's broadcaster. You receive `{"type":"feeds","event":"started",...}`, then `ended` when you stop. Turn on Thumbnail hooks to receive JPEGs every 30 seconds while the stream is live.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 millicast --path /webhooks/millicast
```

Use the printed URL as the Webhook URL.

## Using Hookdeck

Create a source with the **Dolby OptiView Real-time (Millicast)** source type and paste the Webhook Secret exactly as the dashboard shows it. Hookdeck decodes the base64 and verifies `x-millicast-signature` (HMAC-SHA1 of the body). Verification is optional on the source, and Hookdeck applies no timestamp window. Because Millicast never retries, Hookdeck's own retries are the only way to recover a delivery your handler missed.
