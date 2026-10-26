# api.video Webhooks - Express Example

Minimal example of receiving api.video webhooks with signature verification.

## Prerequisites

- Node.js 18+
- An api.video account with a webhook and its `signatureSecret`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook's `signatureSecret` (`sig_sec_...`) to `.env` as `API_VIDEO_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 api-video --path /webhooks/api-video
```

Use the Hookdeck URL as the webhook URL when you create the webhook (dashboard or `POST /webhooks`).

### Trigger events

Upload a video to receive `video.source.recorded` and `video.encoding.quality.completed`, or start a live stream for `live-stream.broadcast.started` / `live-stream.broadcast.ended`.

## Endpoint

- `POST /webhooks/api-video` - Verifies `X-Api-Video-Signature` (hex HMAC-SHA256 of the raw body) and dispatches on the body's `type`

## Run tests

```bash
npm test
```
