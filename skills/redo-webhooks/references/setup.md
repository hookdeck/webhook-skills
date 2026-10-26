# Setting Up Redo Webhooks

## Prerequisites

- A Redo account with API access (an API secret for the Redo API)
- Your store ID (`storeId`)
- A public **HTTPS** endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Generate the Subscriber Secret

Redo does not issue a signing secret. You generate a secret yourself and pass it as `secret`
when creating the subscription. Redo then sends it on every delivery as:

```
Authorization: Bearer your-subscriber-secret
```

Store the **full header value** (`Bearer ` followed by the secret) as `REDO_AUTHORIZATION`.

## Hookdeck Source Setup

If Hookdeck receives the webhooks, create a source of type **Redo**. Hookdeck shows this note:

> Paste the full Authorization header value Redo sends: "Bearer " followed by your subscription secret.

Paste `Bearer your-subscriber-secret`, with the `Bearer ` prefix.

## Create the Subscription

```bash
curl -X POST "https://api.getredo.com/v2.2/stores/$STORE_ID/webhooks" \
  -H "Authorization: Bearer $REDO_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhooks/redo",
    "secret": "your-subscriber-secret-123",
    "topics": ["return.created", "return.updated"]
  }'
```

| Field | Required | Notes |
|-------|----------|-------|
| `url` | yes | HTTPS endpoint |
| `secret` | yes | A token you generate; sent as `Authorization: Bearer <secret>` |
| `topics` | yes | `return.created`, `return.updated` |

With this example the value to store is `REDO_AUTHORIZATION=Bearer your-subscriber-secret-123`.

## Manage Webhooks

- List: `GET https://api.getredo.com/v2.2/stores/{storeId}/webhooks`
- Update: `PATCH https://api.getredo.com/v2.2/webhooks/{webhookId}` (the docs' example changes
  `topics`; changing `secret` this way isn't documented, so rotate by creating a new subscription
  and deleting the old one)
- Delete: `DELETE https://api.getredo.com/v2.2/webhooks/{webhookId}`
- Replay: `POST https://api.getredo.com/v2.2/webhooks/{webhookId}/replay` with
  `{"startTime": "...", "endTime": "..."}`; replayed events arrive with `type: "backfill"`

All of these use `Authorization: Bearer YOUR_API_SECRET` (your Redo API secret, which is not the
subscriber secret).

## Local Testing

```bash
npx hookdeck-cli listen 3000 redo --path /webhooks/redo
```

Use the printed URL as `url`. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/redo \
  -H "Content-Type: application/json" \
  -H "Authorization: $REDO_AUTHORIZATION" \
  -d '{"type":"created","at":"2023-08-18T12:00:00Z","return":{"id":"64df65d4c5a4ca3eff4b4e43","status":"pending"}}'
```
