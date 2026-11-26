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
Or send a trimmed copy of the API Reference's example by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ship24 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SHIP24_WEBHOOK_SECRET" \
  -d '{"trackings":[{"metadata":{"generatedAt":"2025-03-04T17:13:35.000Z","messageId":"356a7f93-3ce5-4b49-b560-156537283df9","topic":"tracking/events"},"tracker":{"trackerId":"26148317-7502-d3ac-44a9-546d240ac0dd","trackingNumber":"9400115901047177598206"},"events":[{"eventId":"ee8ebe96-4eae-4a91-9a99-8f3afa6a0f46","status":"Delivered to the addressee","occurrenceDatetime":"2025-03-04T17:12:57"}]}]}'
```

## Network Notes

Ship24 doesn't sign webhooks. It sends them from `54.161.7.2`, but requests sent with **Test your
integration** don't come from that IP, so set up the Webhook URL before you restrict by IP
([Sending behavior](https://docs.ship24.com/webhooks/delivery)). Serve the endpoint over HTTPS and
keep the Webhook Secret out of logs and source control.
