# Setting Up Klaviyo Webhooks

## Prerequisites

- A Klaviyo account with Advanced KDP (or an Advanced KDP free trial), or a
  Klaviyo app partner's OAuth app. Other accounts can't create system webhooks.
- For the API: a private API key or OAuth token with the `webhooks:read` and
  `webhooks:write` scopes, plus `events:read` for event topics
- Your application's publicly reachable HTTPS endpoint URL (no self-signed
  certificate, no redirect)
- A **secret key** you choose (at least 16 characters; the help center gives
  16 to 100)

You can also create the webhook in Klaviyo under Data management > Webhooks >
Create webhook, which asks for the same name, endpoint URL, secret key and topics,
and offers **Test connection** to send a sample request for a topic before you save.
An account can have up to 10 webhooks.

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
  -H "revision: 2026-10-15"
```

Topic IDs look like `event:klaviyo.opened_email`. See
[overview.md](overview.md) for the common list.

## 3. Create the Webhook

Register your endpoint and subscribe to topics via the Webhooks API. The
`secret_key` is what Klaviyo uses to sign requests.

```bash
curl -X POST https://a.klaviyo.com/api/webhooks \
  -H "Authorization: Klaviyo-API-Key YOUR_PRIVATE_KEY" \
  -H "revision: 2026-10-15" \
  -H "Content-Type: application/vnd.api+json" \
  -d '{
    "data": {
      "type": "webhook",
      "attributes": {
        "name": "My app webhook",
        "endpoint_url": "https://your-app.com/webhooks/klaviyo",
        "secret_key": "your_endpoint_secret_min_16_chars"
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

> Check the current revision in the
> [Create Webhook reference](https://developers.klaviyo.com/en/reference/create_webhook).
> The key point: **the secret key you set here is the HMAC key your handler must
> use.** Klaviyo never returns it, so store it when you set it. It can take a few
> minutes for a new webhook to start sending (Klaviyo's docs say up to 3 minutes
> in one place and up to 15 in another).

## 4. Verify Incoming Requests

Your endpoint receives a POST with these headers:

- `Klaviyo-Signature` — hex HMAC-SHA256 signature
- `Klaviyo-Timestamp` — when the request was sent (part of the signed content)
- `Klaviyo-Webhook-Id` — unique webhook identifier

See [verification.md](verification.md) for how to verify, and `examples/` for
runnable handlers.

## Flow Webhook Action (Unsigned)

A flow **Webhook action** is a separate feature from system webhooks: it POSTs a
JSON body you write and is **not signed**. In the action's settings, add a header
with a long random value (Klaviyo's docs mention headers "for authentication") and
reject requests without it. See [verification.md](verification.md).

## Testing

- Use the [Hookdeck CLI](https://hookdeck.com/docs/cli) to tunnel to localhost
  (`npx hookdeck-cli listen 3000 klaviyo --path /webhooks/klaviyo`).
- Trigger a subscribed event in Klaviyo (e.g. open a test email) to receive a
  real, signed delivery, or use **Test connection** on the Create webhook page.
</content>
