# Setting Up TextUs Webhooks

## Prerequisites

- A TextUs account and an org admin user
- An HTTPS endpoint that accepts JSON `POST` requests and returns `2xx` (e.g. `https://api.yourapp.com/webhooks/textus`)

## Option 1: TextUs Web App

1. Log in to next.textus.com as an org admin.
2. Click your user icon and go to **Accounts**.
3. Find your org account at the top of the hierarchy and click **View**.
4. Go to **Settings > Account Settings > Integrations**.
5. Under **Webhooks**, click **Add Webhook**, enter your endpoint URL and **Save**.

The web app subscribes you to `message.delivered` and `message.received` only.

## Option 2: Integrations API

`POST https://next.textus.com/{your-account-name}/integrations` (use your primary
non-messaging account name, as it appears in the web app URL):

```bash
curl -X POST https://next.textus.com/{your-account-name}/integrations \
  -H "Accept: application/vnd.textus+jsonld" \
  -H "Authorization: Bearer {token}" \
  -d '{
    "@type": "Integration",
    "@context": "/contexts/Integration.jsonld",
    "active": true,
    "provider": "webhook",
    "config": {
      "baseUrl": "https://www.example.com/webhooks/textus",
      "webhookSecret": "your-secret"
    },
    "settings": {
      "actions": {
        "message.received": true,
        "message.delivered": true,
        "message.failed": true,
        "message.unknown": false,
        "phone_call.completed": false,
        "contact.opted_out": true,
        "contact.opted_in": true,
        "contact.created": true
      }
    }
  }'
```

`config.webhookSecret` is described as a user-defined token adding a layer of
security. The docs show it as a `textus-...` string.

## Get Your Signing Secret

Use the webhook's secret from its Integrations config exactly as shown, including
the `textus-` prefix, as the HMAC key:

```bash
TEXTUS_WEBHOOK_SECRET=textus-your-secret
```

## Testing

TextUs publishes no IP ranges, so do not allowlist IPs. Verify the signature
instead. To receive webhooks locally:

```bash
npx hookdeck-cli listen 3000 textus --path /webhooks/textus
```

Use the Hookdeck-provided URL as the `baseUrl`.
