# Setting Up Bunny Stream Webhooks

## Prerequisites

- A [Bunny.net](https://bunny.net/) account with a **Stream video library**
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/bunny-stream`)

## Get Your Signing Secret

Bunny Stream signs webhooks with the video library's **Read-Only API key** — there is no separate "webhook secret" to generate.

1. Go to the Bunny dashboard → **Stream** → select your **video library**.
2. Open **API** (or **Security / API Keys** depending on the dashboard version).
3. Copy the **Read-Only API key**. This is the value you set as `BUNNY_STREAM_WEBHOOK_SECRET`.

> To fetch full video metadata after a webhook, you also need the library's read-write API key for the Stream API. Keep the two keys in separate environment variables.
>
> Retries are signed with the library's current Read-Only API key, so if you reset it, update `BUNNY_STREAM_WEBHOOK_SECRET` straight away.

## Register Your Webhook URL

Webhooks are configured **per video library**:

1. In the dashboard, open your **video library**.
2. Go to the library's **Webhook** settings.
3. Set the **Webhook URL** to your endpoint (e.g. `https://your-app.com/webhooks/bunny-stream`).
4. Save. Bunny will now POST to this URL every time a video in the library changes state.

There is no per-event subscription UI — the library sends a callback for **every** status change. Filter on the `Status` field in your handler.

## Verify It Works

- Upload a short video to the library. As it processes, you should receive callbacks with `Status` values progressing toward `3` (Finished).
- Confirm your endpoint returns `200` for a valid signature and `401` for an invalid/missing one.

## Test Mode vs Live Mode

Bunny Stream has no separate test/live mode for webhooks. For local development, use the Hookdeck CLI to tunnel deliveries to your machine:

```bash
npx hookdeck-cli listen 3000 bunny-stream --path /webhooks/bunny-stream
```

Then set the Hookdeck URL as the library's Webhook URL and upload a test video.

## Retry Behavior

Any `2xx` acknowledges a delivery. If a delivery fails with a network error, a timeout, or a `408`, `429` or `5xx`, Bunny retries after 30 seconds, 2 minutes, 10 minutes, 30 minutes, 1 hour and 2 hours, then drops the webhook (about four hours after the event). Other `4xx` responses are not retried. Removing the webhook URL drops pending retries.

A retry resends the original body, so deduplicate on `EventId`, not on `VideoGuid` and `Status`: `Resolution finished` (4) arrives once per resolution and `SmartGenerationFailed` (33) once per failed feature. Acknowledge quickly and do heavy work asynchronously.
