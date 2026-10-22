# Setting Up WAHA Webhooks

## Prerequisites

- A running WAHA instance (self-hosted)
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen 3000 waha --path /webhooks/waha` for local development)

## Set the HMAC Key

WAHA only signs deliveries when you set a key. Without it there are no `X-Webhook-Hmac` headers, and your endpoint is unauthenticated.

Per session, in the body of `POST /api/sessions` (or when updating the session config):

```json
{
  "name": "default",
  "config": {
    "webhooks": [
      {
        "url": "https://your-app.example.com/webhooks/waha",
        "events": ["message", "session.status"],
        "hmac": { "key": "your-secret-key" }
      }
    ]
  }
}
```

Or server-wide with environment variables on the WAHA container:

```bash
WHATSAPP_HOOK_URL=https://your-app.example.com/webhooks/waha
WHATSAPP_HOOK_EVENTS=message,message.any,message.ack,session.status
WHATSAPP_HOOK_HMAC_KEY=your-secret-key
```

Store the same key in your app as `WAHA_WEBHOOK_HMAC_KEY`. Pick a long random value.

## Select Events

Recommended: `message`, `message.ack`, `session.status`, plus `message.reaction`, `group.v2.join` and `presence.update` if you use them. Avoid `*` in production.

## Retries and Custom Headers (optional)

```json
"retries": { "policy": "exponential", "delaySeconds": 2, "attempts": 15 },
"customHeaders": [{ "name": "X-My-Custom-Header", "value": "Value" }]
```

Server-wide equivalents: `WHATSAPP_HOOK_RETRIES_POLICY`, `WHATSAPP_HOOK_RETRIES_DELAY_SECONDS`, `WHATSAPP_HOOK_RETRIES_ATTEMPTS`, `WHATSAPP_HOOK_CUSTOM_HEADERS` (`Header:Value;Header2:Value`).

## Testing

Send a message to the linked WhatsApp number and watch your endpoint, or use the WAHA Dashboard's Event Monitor. Compare your implementation against the docs test vector in [verification.md](verification.md).
