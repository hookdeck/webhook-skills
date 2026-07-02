# Setting Up Klaviyo Webhooks

## Prerequisites

- A Klaviyo account with API access
- A private API key with the `webhooks:write` scope (and `events:read` for
  event-based topics)
- Your application's publicly reachable webhook endpoint URL
- A webhook **endpoint secret** you choose (minimum 16 characters)

## 1. Choose Your Endpoint Secret

Klaviyo signs system webhooks with **HMAC-SHA256** using a secret **you provide
when creating the webhook**. It must be at least 16 characters. Generate a strong
random value and store it securely — you'll need the same value in your app to
verify signatures.

```bash
# Example: generate a 32-byte hex secret
openssl rand -hex 32
```

Store it in your app's environment:

```bash
KLAVIYO_WEBHOOK_SECRET=your_endpoint_secret_min_16_chars
```

## 2. Discover Available Topics

Fetch the topics enabled for your account:

```bash
curl https://a.klaviyo.com/api/webhook-topics \
  -H "Authorization: Klaviyo-API-Key YOUR_PRIVATE_KEY" \
  -H "revision: 2025-07-15"
```

Topic IDs look like `event:klaviyo.opened_email`. See
[overview.md](overview.md) for the common list.

## 3. Create the Webhook

Register your endpoint and subscribe to topics via the Webhooks API. The `secret`
is what Klaviyo uses to sign requests.

```bash
curl -X POST https://a.klaviyo.com/api/webhooks \
  -H "Authorization: Klaviyo-API-Key YOUR_PRIVATE_KEY" \
  -H "revision: 2025-07-15" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "type": "webhook",
      "attributes": {
        "name": "My app webhook",
        "endpoint_url": "https://your-app.com/webhooks/klaviyo",
        "secret_key": "your_endpoint_secret_min_16_chars",
        "enabled": true
      },
      "relationships": {
        "webhook-topics": {
          "data": [
            { "type": "webhook-topic", "id": "event:klaviyo.opened_email" },
            { "type": "webhook-topic", "id": "event:klaviyo.clicked_email" }
          ]
        }
      }
    }
  }'
```

> Field names and revision date may change as the Webhooks API evolves — confirm
> against the [Webhooks API reference](https://developers.klaviyo.com/en/reference/webhooks_api_overview)
> at build time. The key point: **the secret you set here is the HMAC key your
> handler must use.**

## 4. Verify Incoming Requests

Your endpoint receives a POST with these headers:

- `Klaviyo-Signature` — hex HMAC-SHA256 signature
- `Klaviyo-Timestamp` — when the request was sent (part of the signed content)
- `Klaviyo-Webhook-Id` — unique webhook identifier

See [verification.md](verification.md) for how to verify, and `examples/` for
runnable handlers.

## Flow "Webhook" Action (Unsigned)

If you use the flow **"Webhook" action** instead of system webhooks, the request
is **not signed**. Klaviyo recommends protecting the endpoint by embedding a
secret token in the URL:

```
https://your-app.com/webhooks/klaviyo?token=LONG_RANDOM_TOKEN
```

Reject any request whose token doesn't match. See [verification.md](verification.md).

## Testing

- Use the [Hookdeck CLI](https://hookdeck.com/docs/cli) to tunnel to localhost
  (`npx hookdeck-cli listen 3000 klaviyo --path /webhooks/klaviyo`).
- Trigger a subscribed event in Klaviyo (e.g. open a test email) to receive a
  real, signed delivery.
</content>
