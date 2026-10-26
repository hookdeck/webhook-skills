# Setting Up Mews POS Webhooks

## Prerequisites

- A Mews account with access to the POS API
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI during development)

## Get Your Signing Secret

Mews signs each request with "your secret key". The security page does not describe how the secret is issued (it is tied to the webhook endpoint, per client), so obtain it from the place where your Mews POS webhook is registered or from your Mews contact. Store it as `MEWS_POS_WEBHOOK_SECRET` and use it as-is, as UTF-8 bytes (do not hex- or Base64-decode it).

## Register Your Endpoint

1. Register your endpoint URL for the Mews POS API webhooks (see [Mews POS webhooks](https://docs.mews.com/pos-api/events/webhooks)).
2. Subscribe to the events you need: `booking.status.updated`, `order.state.updated`, `order.status.updated`, `order.total.updated`, `order.payments.added`, `product.availability.updated`.
3. Point the endpoint at `/webhooks/mews-pos` on your server. Mews sends `POST` requests.

## Optional: Shared Secret Token in the URL

The docs also say that, to confirm a request originates from Mews, a shared secret token can be added to the URL. This is an extra check, not a replacement for `X-Signature` verification.

## Local Development

```bash
npx hookdeck-cli listen 3000 mews-pos --path /webhooks/mews-pos
```

Use the printed URL as your webhook URL. FastAPI examples listen on port 8000 instead.
