# Setting Up Semble Webhooks

## Prerequisites

- A Semble practice with webhooks enabled (ask the Semble support team)
- An API token with `seeWebhooks`, `createWebhooks`, `editWebhooks`, and/or `deleteWebhooks` permissions (generate a new token if yours predates them)
- An HTTPS endpoint that accepts `POST` requests (use the Hookdeck CLI for local development)
- Optional: a Technical Contact email in practice settings, where Semble sends paused-subscription notices

## Register Your Endpoint

Subscriptions are created with the GraphQL API. Send `createWebhook` to the Semble GraphQL endpoint with your token (see the Authentication page in Semble's API docs for the endpoint URL and header):

```graphql
mutation CreateWebhook {
  createWebhook(input: {
    label: "Main integration"
    url: "https://your-app.com/webhooks/semble"
    eventTypes: ["booking.created", "booking.updated", "invoice.paid"]
    headers: [{ key: "X-Custom-Header", value: "your-value" }]
  }) {
    data { id secret }
    error
  }
}
```

- `label` (required): a short name for the subscription.
- `url` (required): your HTTPS endpoint.
- `eventTypes` (required): lowercase dotted strings such as `booking.created`.
- `headers` (optional): custom headers added to each delivery.

You can create several subscriptions for one URL as long as no `eventTypes` value repeats for that URL. `updateWebhook` replaces `eventTypes` (it doesn't add to them) and can set `deliveryPaused`. `deleteWebhook` removes a subscription.

## Get Your Signing Secret

The `secret` in the `createWebhook` response is the signing key. Store it right away as `SEMBLE_WEBHOOK_SECRET` and use it as-is, as a UTF-8 string (don't base64-decode it).

## Authentication

Semble's guide describes signature verification as the way to authenticate deliveries. It also lets you add custom headers (such as `Authorization`) to each delivery with `headers`; if you want an extra shared secret, set one there and check it in your handler.

## Testing

Create a subscription pointing at your Hookdeck CLI URL, then make a change in Semble (for example create a booking) to trigger `booking.created`. The Webhook Logs page in Semble shows each delivery's last attempt and lets you requeue a message.
