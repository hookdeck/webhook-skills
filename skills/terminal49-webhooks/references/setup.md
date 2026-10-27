# Setting Up Terminal49 Webhooks

## Prerequisites

- A Terminal49 account with a Terminal49 API key from the developer portal
- A public HTTPS endpoint that accepts `POST` (locally: `npx hookdeck-cli listen 3000 terminal49 --path /webhooks/terminal49`)

## Create the Webhook

**Dashboard:** open Developer > Webhooks and click **Create Webhook Endpoint**.

**API:**

```bash
curl -X POST "https://api.terminal49.com/v2/webhooks" \
  -H "Authorization: Token YOUR_API_KEY" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "webhook",
      "attributes": {
        "url": "https://example.com/webhooks/terminal49",
        "active": true,
        "events": ["tracking_request.succeeded", "tracking_request.failed", "container.updated"]
      }
    }
  }'
```

Subscribe only to the events your integration handles. `List Webhook Events` returns the event
categories available to your account.

## Get Your Signing Secret

The webhook response includes a `secret` attribute. Store it in your secrets manager as
`TERMINAL49_WEBHOOK_SECRET`. Use it as-is: it is the HMAC key as a plain string (not hex- or
base64-decoded).

## Register Your Endpoint

1. Set the webhook `url` to your endpoint, e.g. `https://example.com/webhooks/terminal49`.
2. Choose the events to receive (see [overview.md](overview.md)).
3. Return `200`, `201`, `202` or `204` after you've accepted a notification.

## Test

Use the **Trigger Webhook** endpoint to send a sample payload to your HTTPS URL, or replay one by hand:

```bash
BODY='{"data":{"id":"test-1","type":"webhook_notification","attributes":{"event":"container.updated"}}}'
SIG=$(printf %s "$BODY" | openssl dgst -sha256 -hmac "$TERMINAL49_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/terminal49 \
  -H "Content-Type: application/json" \
  -H "X-T49-Webhook-Signature: $SIG" \
  -d "$BODY"
```

## Network Notes

Terminal49 publishes its webhook source IPs through the **List Webhook IPs** endpoint. If you
allowlist them, fetch the list from the API, cache it and refresh it periodically rather than
hard-coding it. The signature check is still required.
