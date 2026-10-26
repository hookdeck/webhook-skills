# Setting Up Magic Hour Webhooks

## Prerequisites

- A Magic Hour account with API access
- A public HTTPS URL for your webhook endpoint (use the Hookdeck CLI while developing)

## Get Your Signing Secret

1. Open the Magic Hour [Developer Hub](https://magichour.ai/developer?tab=webhooks) and go to
   the **Webhooks** tab.
2. Click **Create Webhook** and fill in the form (see below).
3. After creating it, copy the **webhook secret** and store it securely (for example as
   `MAGIC_HOUR_WEBHOOK_SECRET`). It starts with `whsec_`.

Paste the whole secret, including the whsec_ prefix. Magic Hour uses it as a plain HMAC key.

That sentence is also the note Hookdeck shows when you create a Magic Hour source
(source type `MAGIC_HOUR`). Do not strip the prefix and do not base64-decode the secret: it is
the HMAC key exactly as shown.

## Register Your Endpoint

In the **Create Webhook** modal:

1. **Endpoint URL**: your public HTTPS URL, for example `https://example.com/webhooks/magic-hour`.
2. **Events**: tick the events you want. The nine options are `video.started`,
   `video.completed`, `video.errored`, `image.started`, `image.completed`, `image.errored`,
   `audio.started`, `audio.completed` and `audio.errored`. At minimum pick the `completed` and
   `errored` events for the resources you use.
3. Click **Create Webhook**.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 magic-hour --path /webhooks/magic-hour
```

Use the URL it prints as the Endpoint URL. (FastAPI examples listen on port 8000, so use
`npx hookdeck-cli listen 8000 magic-hour --path /webhooks/magic-hour`.)

## Test It

Trigger a real job with the Magic Hour API (for example an AI image with `image_count=1`) and
watch for `image.started` followed by `image.completed`. Webhooks are sent as `POST` requests.

## Test vs Production

Magic Hour documents no separate test mode: register a separate webhook (with its own secret)
per environment and keep each secret in that environment's config.
