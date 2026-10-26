# Setting Up Memberful Webhooks

## Prerequisites

- A Memberful account with access to Settings → Webhooks
- A publicly reachable HTTPS endpoint that accepts `POST` (locally: `npx hookdeck-cli listen 3000 memberful --path /webhooks/memberful`)

## Register Your Endpoint and Get the Secret

1. In your Memberful dashboard go to **Settings → Webhooks** and create a webhook.
2. Enter your endpoint URL and select the events you want. Only selected events are sent.
3. Memberful gives you a secret key once the webhook is created. Store it as `MEMBERFUL_WEBHOOK_SECRET`. It is used as-is, as UTF-8 bytes (not hex- or base64-decoded).
4. Trigger a test webhook from the dashboard to confirm delivery, and inspect the payload to confirm where the event name sits (the examples assume a top-level `event` field).

If Memberful isn't reaching you, point the webhook at a temporary logger such as Webhook.site to see what is sent.

## HTTP Method

Memberful sends `POST` with a JSON body, so the examples accept `POST` only and answer `405` to other methods. Hookdeck's Memberful source verifies the signature and manages the method as POST.

## Delivery Behaviour

Respond `2xx` within 15 seconds or Memberful retries with exponential delay. Delivery order is not guaranteed, so fetch the latest member, subscription or order from the Memberful API before acting. See [overview.md](overview.md).

## Test

Sign a body yourself and send it:

```bash
BODY='{"event":"subscription.created","subscription":{"id":1234},"member":{"id":42}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$MEMBERFUL_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/memberful \
  -H "Content-Type: application/json" -H "X-Memberful-Webhook-Signature: $SIG" -d "$BODY"
```
