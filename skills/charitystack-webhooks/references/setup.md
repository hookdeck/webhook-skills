# Setting Up CharityStack Webhooks

## Prerequisites

- A CharityStack account with an API key (sent as `Authorization: Bearer cs_live_...`)
- A public HTTPS endpoint that accepts `POST`. For local development, use a tunnel such as the Hookdeck CLI.

## Get Your Webhook Secret

CharityStack shows the webhook secret only once, when you create the webhook. Paste it here.

There is no dashboard step: the secret is returned in the `POST /v1/webhooks` response. Copy it into `CHARITYSTACK_WEBHOOK_SECRET` (or your secrets manager) before closing the response. If you lose it, delete the webhook and create a new one.

Use the secret as-is, as UTF-8 bytes. Don't hex- or base64-decode it.

## Register Your Endpoint

```bash
curl -X POST <CharityStack API base URL>/v1/webhooks \
  -H "Authorization: Bearer cs_live_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.example.com/webhooks/charitystack",
    "events": ["donation.created", "subscription.cancelled"],
    "description": "Production event listener"
  }'
```

The API base URL is in the [CharityStack API docs](https://www.charitystack.com/docs/concepts/webhooks). Recommended events for a first integration: `donation.created`, `donation.updated`, `subscription.created`, `subscription.cancelled`, `contact.created`.

For local testing, run `npx hookdeck-cli listen 3000 charitystack --path /webhooks/charitystack` and register the printed URL.

## Check the Webhook

`GET /v1/webhooks` and `GET /v1/webhooks/{id}` return `status`, `lastDeliveryAt`, `successCount` and `failureCount`.

## Test Mode vs Live Mode

The docs show live keys (`cs_live_...`). No separate webhook test mode is documented, so verify end to end with a real low-value event or by replaying a captured delivery through Hookdeck.
