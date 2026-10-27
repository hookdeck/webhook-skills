# Setting Up Basiq Webhooks

## Prerequisites

- A Basiq application and a server access token for the Basiq API (`Authorization: Bearer ...`)
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

Basiq webhook subscriptions are managed through the API, not a dashboard form.

## How Do I Create a Basiq Webhook Subscription?

```bash
curl -X POST https://au-api.basiq.io/notifications/webhooks \
  -H "Authorization: Bearer $BASIQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production receiver",
    "description": "Consent and connection events",
    "url": "https://your-app.com/webhooks/basiq",
    "subscribedEvents": ["user.created", "connection.activated", "consent.revoked", "transactions.updated"]
  }'
```

Only `url` is required. `subscribedEvents` lists the event types to send. Get valid values from `GET /events/types`.

## Where Do I Get the Signing Secret?

Each subscription has its own signing secret in the form `whsec_` followed by base64. The create-webhook response includes a `secret` field. Put the **full value, including `whsec_`**, in `BASIQ_WEBHOOK_SECRET`. A secret from one subscription won't verify deliveries from another. Use `GET /notifications/webhooks/{webhookId}` to look a subscription up again.

## How Do I Send a Test Message?

```bash
curl -X POST https://au-api.basiq.io/notifications/messages/test \
  -H "Authorization: Bearer $BASIQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventTypeId": "user.created", "Text": "My test message"}'
```

This sends a test webhook for the event type to your subscriptions.

## Managing Subscriptions

| Call | Purpose |
|------|---------|
| `GET /notifications/webhooks` | List your subscriptions |
| `POST /notifications/webhooks` | Create a subscription |
| `GET /notifications/webhooks/{webhookId}` | Get one subscription |
| `POST /notifications/webhooks/{webhookId}` | Update a subscription |
| `DELETE /notifications/webhooks/{webhookId}` | Delete a subscription |
| `GET /notifications/webhooks/{webhookId}/messages` | List sent messages |

## Local Development

```bash
npx hookdeck-cli listen 3000 basiq --path /webhooks/basiq
```

Use 8000 for FastAPI. Create a subscription with the printed URL as `url`, then send a test message.

## Things to Know

- A new subscription can take up to 15 minutes to start delivering. If nothing arrives after that, contact support@basiq.io.
- Basiq documents no challenge or handshake step for new endpoints.
- If your endpoint sits behind a firewall, allow `13.238.192.210`, `3.24.252.173` and `3.104.17.39`.
