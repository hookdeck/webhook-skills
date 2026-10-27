# Setting Up Campfire Webhooks

## Prerequisites

- A Campfire instance and an **admin** user (non-admin users and API keys get `403`)
- A public HTTPS URL for your endpoint (use `npx hookdeck-cli listen 3000 campfire --path /webhooks/campfire` while developing; use port 8000 for FastAPI)

## How Do I Create a Webhook in the Campfire App?

1. Go to **Settings > Developer > Webhooks**.
2. Click **New Webhook**, enter the HTTPS URL, check **Active**, and select topics (grouped by object: Invoices, Bills, Journal Entries, and so on; pick a group or individual topics).
3. After saving, the webhook card shows an **HMAC-SHA256 Secret**. Click **Show** and store it in your secret store as `CAMPFIRE_WEBHOOK_SECRET`.

## How Do I Create a Webhook via the API?

```bash
curl -X POST https://api.meetcampfire.com/integrations/api/v1/webhook \
  -H "Authorization: Token $CAMPFIRE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/campfire",
    "active": true,
    "topics": [{"name": "Invoice.paid"}, {"name": "Bill.created"}]
  }'
```

The response includes `id`, `uuid` and `token`, the 50-character signing secret:

```json
{ "id": 12, "uuid": "3c88df19-1c1f-4b1c-b4a7-768793055a60", "token": "your-50-character-signing-secret", "active": true }
```

## Where Is the Signing Secret?

- It is the `token` field (read-only, returned on every read) or **Show** on the webhook card.
- Campfire generates it. You **cannot set or change** it. To rotate: delete the webhook, create a new one, update `CAMPFIRE_WEBHOOK_SECRET`.
- Use it as-is, as UTF-8 text. Do not hex- or base64-decode it.
- It is not your API key. The API key authenticates you to Campfire; the signing secret verifies Campfire to you.

## Managing Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/integrations/api/v1/webhook` | List webhooks |
| POST | `/integrations/api/v1/webhook` | Create |
| GET | `/integrations/api/v1/webhook/{id}` | Retrieve |
| PUT / PATCH | `/integrations/api/v1/webhook/{id}` | Update |
| DELETE | `/integrations/api/v1/webhook/{id}` | Delete |
| GET | `/integrations/api/v1/webhook/{id}/events` | Recent deliveries |

- `{id}` is the integer `id`, not the `uuid`.
- `url` and `active` are required on create and update.
- Updating `topics` **replaces** the whole set: send every topic you want.
- Set `"active": false` to pause deliveries without deleting.

## Which Topics Should I Subscribe To?

Subscribe only to what you handle. A common start: `Invoice.created`, `Invoice.payment`, `Invoice.paid`, `Bill.created`, `Bill.paid`, `JournalEntry.created`. Unsubscribed topics are never sent.

## Testing

There is no "send test" button documented. Trigger a real event (for example create a draft invoice with `Invoice.created` subscribed), then check **Recent Events** on the Webhooks page: each entry shows the exact headers, body and computed signature, which you can compare with your own computation.
