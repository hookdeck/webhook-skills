# Setting Up Mews POS Webhooks

## Prerequisites

- A Mews account with access to the POS API
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI during development)

## Get Your Signing Secret

Each webhook endpoint has its own `secret`. Mews returns it in the `secret` attribute of the webhook endpoint resource, in the response to Create webhook endpoint and in Get webhook endpoints ([Webhook Endpoints](https://docs.mews.com/pos-api/operations/webhook-endpoints)). Store it as `MEWS_POS_WEBHOOK_SECRET` and use it as-is, as UTF-8 bytes (do not hex- or Base64-decode it). The docs don't describe rotating it, and Update webhook endpoint only changes `targetUrl` and `events`.

## Register Your Endpoint

1. Call Create webhook endpoint, `POST /v1/webhook-endpoints` on `https://api.mews.com/pos` (staging: `https://api.mews-demo.com/pos`), authenticated with your POS API bearer token. Send a JSON:API body with `type: "webhookEndpoints"` and `attributes.targetUrl` (required, up to 100 characters) pointing at `/webhooks/mews-pos` on your server.
2. List the events you need in `attributes.events`: `booking.status.updated`, `order.state.updated`, `order.status.updated`, `order.total.updated`, `order.payments.added`, `product.availability.updated`.
3. To change the subscription later, call Update webhook endpoint, `PATCH /v1/webhook-endpoints/{id}`. Mews sends `POST` requests.

## Local Development

```bash
npx hookdeck-cli listen 3000 mews-pos --path /webhooks/mews-pos
```

Use the printed URL as your webhook URL. FastAPI examples listen on port 8000 instead.
