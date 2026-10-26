# Setting Up Omnisend Webhooks

## Prerequisites

- A paid Omnisend plan (webhooks in automations are not available on the free plan)
- A public HTTPS endpoint: `https`, a fully-qualified domain name (no IP literals), port 443 only,
  valid TLS certificate, not an internal address
- To create the automation through the API: an API key with the `automations.write` scope

Locally, use `npx hookdeck-cli listen 3000 omnisend --path /webhooks/omnisend` to get a public
HTTPS URL (FastAPI example: port 8000).

## Choose a Shared Secret

Generate a long random value and store it as `OMNISEND_WEBHOOK_SECRET`. If you will send it as
`Authorization: Bearer <value>`, the secret to store is the whole string `Bearer <value>`. Set
`OMNISEND_WEBHOOK_HEADER` to the header name you choose (default `X-Webhook-Secret`).

## Add the Webhook Action

In the Omnisend automation editor, add a **Send webhook** action, enter your URL, add the header
(name and value above) and write the JSON body. Or use the API:

```bash
curl -X POST 'https://api.omnisend.com/api/automations' \
  -H 'Authorization: Omnisend-API-Key YOUR-API-KEY' \
  -H 'Omnisend-Version: 2026-03-15' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "New Subscriber Webhook",
    "trigger": { "condition": { "event": "subscribed to marketing" } },
    "blocks": [{
      "temporaryID": "webhook-notify",
      "type": "action",
      "action": {
        "type": "sendWebhook",
        "sendWebhook": {
          "callbackUrl": "https://example.com/webhooks/omnisend",
          "headers": [{"key": "X-Webhook-Secret", "value": "my-shared-secret"}],
          "body": "{\"contactEmail\": \"[[contact.email]]\", \"contactName\": \"[[contact.first_name]]\", \"event\": \"subscribed\"}"
        }
      }
    }]
  }'
```

The automation is created disabled. Enable it, and disable it before replacing blocks (a PATCH
on an enabled automation returns 409). Limits: up to 15 headers (key max 256 chars, value max
10,000), body max 64 KB, `callbackUrl` max 2,000 chars. You cannot set `Content-Type`, `Host`,
`User-Agent` and a few other system headers.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/omnisend \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $OMNISEND_WEBHOOK_SECRET" \
  -d '{"contactEmail":"jane@example.com","contactName":"Jane","event":"subscribed"}'
```

Or point the `callbackUrl` at webhook.site first to see exactly what Omnisend sends.

## Troubleshooting Setup

- 400 on create: URL not HTTPS, IP literal, non-443 port or internal address; or body is not valid JSON.
- Nothing arrives: valid TLS certificate, accepts POST, and not blocking Omnisend's IPs.
- Duplicate headers are rejected (header keys are case-insensitive and unique).
