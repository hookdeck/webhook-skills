# Setting Up api.video Webhooks

## Prerequisites

- An api.video account and project
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 api-video --path /webhooks/api-video` locally; FastAPI example uses port 8000)

## Get Your Signing Secret

The secret is created with the webhook:

1. Create the webhook (below).
2. The `201` response includes `signatureSecret` (`sig_sec_...`).
3. You can fetch it again with `GET /webhooks/{webhookId}`. The webhook ID is also sent on every delivery in the `X-Api-Video-WebhookID` header.
4. Store it as `API_VIDEO_WEBHOOK_SECRET`.

## Register Your Endpoint

**Dashboard:** Project settings -> Webhooks, add your URL and choose events.

**API:** `POST /webhooks` with the URL and the events to subscribe to.

Recommended events: `video.source.recorded`, `video.encoding.quality.completed`, `live-stream.broadcast.started`, `live-stream.broadcast.ended`.

## Test Mode vs Live Mode

Use a separate webhook per environment so each has its own secret. Upload a short video to trigger `video.source.recorded` and `video.encoding.quality.completed`.
