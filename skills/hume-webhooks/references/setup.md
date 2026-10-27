# Setting Up Hume Webhooks

For Hume EVI (speech-to-speech) webhooks. Paste the webhook signing key from the Developers page.

## Prerequisites

- A Hume account with an API key
- An **HTTPS** URL for your handler. For local development, use `npx hookdeck-cli listen 3000 hume --path /webhooks/hume` and use the URL it prints.
- In an organization, only **admins** can generate or rotate the webhook signing key.

## Get Your Webhook Signing Key

1. Open the **Developers** page on the Hume platform.
2. Click **Generate signing key**.
3. Copy the key and store it securely as `HUME_WEBHOOK_SECRET`.

The signing key is a stable, per-account secret. It does not change when you rotate your API key or switch authentication methods. **Generating a new key immediately invalidates the previous one**, and payloads signed with the old key will fail verification, so update `HUME_WEBHOOK_SECRET` right away.

## Subscribe an EVI Config to Events

Webhooks are part of an EVI Config. Add a `webhooks` array with your URL and the events you want:

```bash
curl https://api.hume.ai/v0/evi/configs \
  -H "X-Hume-Api-Key: <YOUR_API_KEY>" \
  --json '{
    "evi_version": "3",
    "name": "Sample Webhook Config",
    "webhooks": [{
      "url": "https://your-app.example.com/webhooks/hume",
      "events": ["chat_started", "chat_ended", "tool_call"]
    }]
  }'
```

Available events: `chat_started`, `chat_ended`, `tool_call`.

## Test the Webhook

Start a Chat that uses the Config. `chat_started` arrives when the session begins and `chat_ended` when it ends. The requests carry `X-Hume-AI-Webhook-Signature` and `X-Hume-AI-Webhook-Timestamp` headers.

## Hookdeck

In Hookdeck, create a source of type **Hume** and paste the webhook signing key there. Hookdeck verifies `X-Hume-AI-Webhook-Signature` over `{body}.{X-Hume-AI-Webhook-Timestamp}` and forwards the request to your handler.
