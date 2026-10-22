# Setting Up HeyGen Webhooks

## Prerequisites

- A HeyGen account with an API key (`X-Api-Key`) or OAuth access token
- A publicly reachable HTTPS URL for your endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint (v3 API)

```bash
curl -X POST "https://api.heygen.com/v3/webhooks/endpoints" \
  -H "X-Api-Key: $HEYGEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://yourapp.com/webhooks/heygen",
    "events": ["avatar_video.success", "avatar_video.fail", "video_translate.success", "video_translate.fail"]
  }'
```

`events` is optional: omit it (or send `null`) to receive all event types. `entity_id` optionally scopes the endpoint to one resource.

## Get Your Signing Secret

The create response includes `data.secret` (e.g. `whsec_k7x9m2...`). **It is shown only on creation and on rotation** (list responses return `null`). Store the whole string, including `whsec_`, as `HEYGEN_WEBHOOK_SECRET`.

## Rotate the Secret

`POST /v3/webhooks/endpoints/{endpoint_id}/rotate-secret` returns a new secret and invalidates the old one immediately. Expect a short window of failed verifications while you deploy the new value.

## Manage Endpoints

- `GET /v3/webhooks/endpoints` - list
- `PATCH /v3/webhooks/endpoints/{endpoint_id}` - change `url` and/or `events` (the `events` array is fully replaced)
- `DELETE /v3/webhooks/endpoints/{endpoint_id}` - remove
- `GET /v3/webhooks/events` - browse delivered events

## Callbacks Instead of Endpoints

Pass `callback_url` (and optionally `callback_id`) when creating a video, Video Agent session, or translation for a one-off notification without registering an endpoint.

## Local Development

HeyGen can't reach `localhost`. Tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 heygen --path /webhooks/heygen   # Express / Next.js
npx hookdeck-cli listen 8000 heygen --path /webhooks/heygen   # FastAPI
```

Register the public URL the CLI prints as your endpoint's `url`.
