# Setting Up Sinch Conversation API Webhooks

> For Sinch Conversation API callbacks. Set a secret on the Conversation API webhook and paste it here; other Sinch APIs sign callbacks differently.

## Prerequisites

- A Sinch account with a Conversation API app
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI for local development)

## Get Your Signing Secret

The secret is one you choose: it is the `secret` field of the Conversation API webhook. Callbacks are signed **only when the webhook has a secret**.

1. Pick a random string and store it as `SINCH_WEBHOOK_SECRET`.
2. Set it as `secret` when you create or update the webhook (see below). It is used as-is, as UTF-8 bytes, for the HMAC key (do not hex- or base64-decode it).

## Register Your Endpoint

Create the webhook with the Conversation API (Sinch Build dashboard: your app's webhooks section, or the API):

1. Set `target` to your public URL (e.g. `https://your-app.example.com/webhooks/sinch`) and `target_type` to `HTTP`.
2. Set `secret` to your signing secret.
3. List the `triggers` you want, for example `MESSAGE_INBOUND`, `MESSAGE_DELIVERY` and `CONTACT_CREATE`. The callback body's top-level key (`message`, `message_delivery_report`, `contact_create_notification`, ...) tells you which one arrived.

Check the current trigger names and request shape in [Sinch's documentation](https://developers.sinch.com/docs/conversation/callbacks). OAuth2 callback authentication is a separate option and is not covered by this skill.

## Using Hookdeck

Create a Hookdeck source of type **Sinch** and paste the same secret into it. Hookdeck's setup note for the source:

> For Sinch Conversation API callbacks. Set a secret on the Conversation API webhook and paste it here; other Sinch APIs sign callbacks differently.

Then use the Hookdeck source URL as the webhook `target`. The Sinch source manages the method as POST.

## Local Development

```bash
# Express or Next.js (port 3000)
npx hookdeck-cli listen 3000 sinch --path /webhooks/sinch

# FastAPI (port 8000)
npx hookdeck-cli listen 8000 sinch --path /webhooks/sinch
```

Use the public URL the CLI prints as the webhook `target`. Sinch does not retry callbacks to known test domains (webhook.site, ngrok, ...), so use the Hookdeck URL.

## Testing

Sign a test body yourself with the secret (`base64(HMAC-SHA256(secret, body + "." + nonce + "." + timestamp))`, with the nonce and timestamp sent as headers) and POST it to your receiver; each example README shows a one-liner.
