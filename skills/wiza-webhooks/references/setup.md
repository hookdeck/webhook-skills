# Setting Up Wiza Webhooks

## Prerequisites

- A Wiza account with API access and an API key
- A public HTTPS URL for your endpoint (use `npx hookdeck-cli listen 3000 wiza --path /webhooks/wiza` locally)

## Where Do I Set the Webhook URL?

Either:

1. **Default URL:** in Wiza, go to **Settings > API** and enter the webhook URL. Optionally enable
   **Send All Callbacks** so every callback is delivered there.
2. **Per request:** pass `callback_url` when you start a reveal through the API.

## What Credential Does My Endpoint Check?

Wiza adds an `x-auth-key` header containing a SHA-256 hash of your API key. Set `WIZA_API_KEY` to
the API key; the examples hash it and compare the digest with the header.

Rotating the Wiza API key changes the `x-auth-key` value. Update your configuration with it.

## Using Hookdeck

Hookdeck's Wiza source compares the whole `x-auth-key` value with the key you configure, so:

> Enter the lowercase hex SHA-256 hash of your Wiza API key, as sent in `x-auth-key`, not the API key itself.

```bash
printf %s "$WIZA_API_KEY" | sha256sum
# or
node -e "console.log(require('crypto').createHash('sha256').update(process.env.WIZA_API_KEY).digest('hex'))"
```

Use the Hookdeck source URL as the webhook URL in Wiza.

## Testing

Start a reveal from the API with a `callback_url` pointing at your endpoint, or send a request by
hand with the computed hash in `x-auth-key` (see the example READMEs).
