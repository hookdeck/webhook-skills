# Setting Up Ship24 Webhooks

## Prerequisites

- A Ship24 account with API access and Trackers to follow
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 ship24 --path /webhooks/ship24`)

## Get Your Webhook Secret

Paste the Webhook Secret from your Ship24 dashboard.

1. Open your Ship24 dashboard and find the webhook settings.
2. Copy the **Webhook Secret**. Ship24 allocates a random one to your account.
3. Store just the secret as `SHIP24_WEBHOOK_SECRET`, without the `Bearer ` prefix. Ship24 adds the
   prefix when it sends the request; the examples check for it and compare the rest to your secret.

If you paste the value with a `Bearer ` prefix, the examples strip it, so both forms work.

## Register Your Endpoint

1. In the dashboard, set the **Webhook URL** to your endpoint, e.g.
   `https://example.com/webhooks/ship24`. Ship24 pushes new tracking events here with `POST`.
2. If you subscribed to the Proof of Delivery add-on, also set the **Proof of Delivery Webhook
   URL**. Without it no proof of delivery message is sent. It can point at the same endpoint;
   messages are told apart by `metadata.topic`.
3. Optional: "Maximum number of updates per webhook message" controls grouping. The default on
   recent accounts is 1 (one update per message). Higher values add about 15 minutes of delay.

## Test

Use the dashboard's webhook test: Ship24 sends a message with dummy tracking events to your URL.
Or replay one by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ship24 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SHIP24_WEBHOOK_SECRET" \
  -d '{"trackings":[{"metadata":{"generatedAt":"2025-03-04T17:13:35.000Z","messageId":"test-1","topic":"tracking/events"},"tracker":{"trackingNumber":"9400115901047177598206"},"events":[{"eventId":"e1","status":"In transit","occurrenceDatetime":"2025-03-04T17:12:57"}]}]}'
```

## Network Notes

Ship24 doesn't publish a signature or an IP range for webhooks. Serve the endpoint over HTTPS and
rotate the Webhook Secret if it leaks.
