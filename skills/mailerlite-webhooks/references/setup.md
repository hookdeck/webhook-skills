# Setting Up MailerLite Webhooks

## Prerequisites

- MailerLite account (new MailerLite) with an API token
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen 3000 mailerlite --path /webhooks/mailerlite` for local development)

## Create a Webhook and Get Its Secret

Webhooks are managed through the API. Create a MailerLite API token (see the [API getting started guide](https://developers.mailerlite.com/docs/)), then:

```bash
curl -X POST https://connect.mailerlite.com/api/webhooks \
  -H "Authorization: Bearer $MAILERLITE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My webhook",
    "url": "https://example.com/webhooks/mailerlite",
    "events": ["subscriber.created", "subscriber.unsubscribed", "campaign.sent"],
    "enabled": true
  }'
```

The response's `data.secret` (for example `"ybmcD7PQ9R"`) is the signing secret. Store it as `MAILERLITE_WEBHOOK_SECRET`. You can read it again with `GET https://connect.mailerlite.com/api/webhooks`.

| Field | Required | Notes |
|-------|----------|-------|
| `events` | Yes | Array of event names from the list in [overview.md](overview.md) |
| `url` | Yes | Your endpoint |
| `name` | No | Label |
| `enabled` | No | |
| `batchable` | No | Must be `true` for `campaign.open`, `campaign.click` and `subscriber.deleted`. Batched deliveries arrive as `{ "events": [...], "total": n }` |

Each webhook has its own secret, so use one secret per webhook endpoint. Update with `PUT /api/webhooks/{webhook_id}` and delete with `DELETE /api/webhooks/{webhook_id}`.

## Choosing Events

Start with `subscriber.created`, `subscriber.updated`, `subscriber.unsubscribed` and `campaign.sent`. Add `campaign.open` and `campaign.click` only if you need engagement data, since they are high volume and require `batchable: true`.

## Testing

The webhooks API documents no test-event endpoint. Trigger a real event (for example add a test subscriber) and use the Hookdeck CLI to inspect the delivery.
