# Setting Up Zernio Webhooks

## Prerequisites

- A Zernio account and API key
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Choose Your Signing Secret

Zernio never generates a secret for you. Pick a long random string yourself and send it when you create the endpoint:

```bash
openssl rand -hex 32
```

Store it as `ZERNIO_WEBHOOK_SECRET` in your app. Without a secret on the endpoint, Zernio sends **unsigned** deliveries.

## Register Your Endpoint

Call `POST /v1/webhooks/settings` (or edit endpoints in the Zernio webhooks dashboard):

```bash
curl -X POST https://zernio.com/api/v1/webhooks/settings \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production",
    "url": "https://example.com/webhooks/zernio",
    "secret": "'"$ZERNIO_WEBHOOK_SECRET"'",
    "events": ["post.published", "post.failed", "message.received"]
  }'
```

Confirm the base URL and auth scheme in the [Zernio API reference](https://docs.zernio.com/webhooks/create-webhook-settings). You can create up to 50 endpoints per user. Subscribe each endpoint only to the events it handles.

Optional scoping: `profileIds` or `accountIds` pin an endpoint to specific profiles or accounts (useful for a staging endpoint).

## Test Your Endpoint

Send a `webhook.test` event right away with `POST /v1/webhooks/test` and the `webhookId` (the `_id` returned when you created the endpoint):

```bash
curl -X POST https://zernio.com/api/v1/webhooks/test \
  -H "Authorization: Bearer $ZERNIO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhookId": "507f1f77bcf86cd799439011"}'
```

`webhook.test` is sent once, synchronously, to the endpoint whatever its `events` list says, and is never retried. A `500` from the test call means your endpoint did not answer `2xx`. Check attempts in webhook logs (`GET /v1/webhooks/logs`) or the dashboard.

## Local Development

```bash
npx hookdeck-cli listen 3000 zernio --path /webhooks/zernio
```

Use the Hookdeck connection URL as the endpoint `url` in Zernio. Use port `8000` for the FastAPI example.

## Delivery and Disabling

- Return `2xx` within 5 seconds, then process in the background.
- Up to 7 attempts; failed events end up in a dead-letter queue you can redeliver.
- Zernio disables an endpoint after 3 days with no successful delivery plus 20 consecutive terminal failures (or 3 days of continuous failing), and emails the owner. Re-enable with `isActive: true` on the update call.
