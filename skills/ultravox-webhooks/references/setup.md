# Setting Up Ultravox Webhooks

## Prerequisites

- An Ultravox account with access to create webhooks
- A publicly reachable HTTPS endpoint (for local work, use the Hookdeck CLI below)

## Get Your Webhook Secret

Each Ultravox webhook has a secret, either auto-generated or user-provided when the webhook is
created. See [Ultravox: Securing webhooks](https://docs.ultravox.ai/webhooks/securing-webhooks).

Store it as `ULTRAVOX_WEBHOOK_SECRET`. Use the value exactly as given: it is the HMAC key as
UTF-8 bytes, not hex- or base64-decoded.

## Register Your Endpoint

1. Create a webhook in Ultravox (see the [webhooks overview](https://docs.ultravox.ai/webhooks/overview)),
   pointing at your endpoint, e.g. `https://your-app.example.com/webhooks/ultravox`.
2. Subscribe to the events you need: `call.started`, `call.joined`, `call.ended`, `call.billed`.
3. Set the webhook's `secrets`, or keep the one Ultravox generates. To rotate, add the new secret
   alongside the old one, switch your receiver, then remove the old one.

## Receiving Through Hookdeck

In Hookdeck, create a source of type **Ultravox** and paste the webhook's secret into it.
Point the Ultravox webhook at the Hookdeck source URL. When you rotate the secret in Ultravox,
update the source's secret straight away.

## Local Development

```bash
npx hookdeck-cli listen 3000 ultravox --path /webhooks/ultravox
```

Use port `8000` for the FastAPI example.
