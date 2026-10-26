# Setting Up SendX Webhooks

## Prerequisites

- A SendX account with access to your team's API key
- Your application's webhook endpoint URL (HTTPS recommended)

## Get Your Signing Secret

> Paste your SendX team API key. SendX signs webhooks with it.

1. In SendX, open Settings → Team API Key.
2. Copy the key. It is the same key you send as `X-Team-ApiKey` to the REST API; there is no separate
   webhook secret.
3. Set it as `SENDX_WEBHOOK_SECRET` (used as UTF-8 bytes, exactly as shown).

Use the **Team API Key**, not a personal or project key.

## Register Your Endpoint

Create the webhook in the SendX app, or with the API (`POST https://api.sendx.io/api/v1/rest/webhook`
with header `X-Team-ApiKey`):

```json
{
  "enabled": true,
  "url": "https://example.com/webhooks/sendx",
  "contactCreated": true,
  "unsubscribed": true,
  "dropped": true,
  "bounced": true,
  "markedSpam": true,
  "clicked": true,
  "opened": true
}
```

`url` and `enabled` are required; each event toggle defaults to `false`.

## With Hookdeck

Create a source with type **SendX** and paste your SendX team API key. SendX signs webhooks with it.
Hookdeck's SendX source verifies the signature and manages the method as `POST`. Point the SendX
webhook URL at the Hookdeck source URL.

For local development:

```bash
npx hookdeck-cli listen 3000 sendx --path /webhooks/sendx
```

## Testing

SendX also fires from seed tests (`Seed contact` event codes). Send a campaign to a seed contact, or
create a contact, to see a delivery.
