# Setting Up Airweave Webhooks

Airweave has no dashboard form for webhooks in the docs. You manage subscriptions through the Subscriptions API (beta). Base URL: `https://api.airweave.ai`.

## Prerequisites

- An Airweave account
- Admin or owner role and a Bearer token for create, update, delete and recover calls. API key auth (`x-api-key`) works for read-only calls: listing subscriptions, reading messages and viewing delivery attempts
- A public HTTPS endpoint (HTTP is only allowed for local development). For local work, run `npx hookdeck-cli listen 3000 airweave --path /webhooks/airweave` (use `8000` for FastAPI) and register the URL it prints

## Register Your Endpoint

```bash
curl -X POST 'https://api.airweave.ai/webhooks/subscriptions' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://your-server.com/webhooks/airweave",
    "event_types": ["sync.completed", "sync.failed", "source_connection.auth_completed", "collection.deleted"]
  }'
```

The response includes the subscription `id` (for example `ep_2bVxUn3RFnLYHa8z6ZKHMT9PqPX`), `url`, `filter_types` and `disabled`. It does not include the secret. There is no verification challenge: Airweave starts delivering as soon as the subscription exists.

Recommended events: `sync.completed` and `sync.failed` for most integrations. Subscribe to any combination of the 11 documented event types.

## Get Your Signing Secret

```bash
curl -X GET 'https://api.airweave.ai/webhooks/subscriptions/{subscription_id}?include_secret=true' \
  -H 'x-api-key: YOUR_API_KEY'
```

The response includes a `secret` field in the format `whsec_...`. Put the whole value in `AIRWEAVE_WEBHOOK_SECRET`.

### What If I Set a Custom Secret?

You can pass your own `secret` (minimum 24 characters) when you create the subscription. Verifiers still need the `whsec_` value Airweave returns. Hookdeck's Airweave source gives the same instruction:

> If you set a custom secret, paste the whsec_ secret Airweave returns for the subscription, not the value you sent.

Each subscription has its own secret.

## Manage Subscriptions

| Task | Call |
|------|------|
| List | `GET /webhooks/subscriptions` |
| Get one (includes recent delivery attempts) | `GET /webhooks/subscriptions/{id}` |
| Change URL or event types | `PATCH /webhooks/subscriptions/{id}` with `url` / `event_types` |
| Disable | `PATCH` with `{"disabled": true}` |
| Enable, optionally recovering missed messages | `PATCH` with `{"disabled": false, "recover_since": "2025-01-15T00:00:00Z"}` |
| Delete | `DELETE /webhooks/subscriptions/{id}` |

## Recover Failed Messages

If your endpoint was down, replay failed messages in chronological order:

```bash
curl -X POST 'https://api.airweave.ai/webhooks/subscriptions/{subscription_id}/recover' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{ "since": "2025-01-15T00:00:00Z", "until": "2025-01-16T00:00:00Z" }'
```

`since` is required and inclusive; `until` defaults to now.

## Inspect Messages

`GET /webhooks/messages` lists delivered messages (filter by event type), and `GET /webhooks/messages/{id}` returns one, optionally with delivery attempts. Use them to see why a delivery failed.

## Test Mode vs Live Mode

Airweave has no separate test mode for webhooks. Create a subscription pointing at your Hookdeck CLI URL, trigger a sync from your collection, and watch the delivery in the Hookdeck web UI. The Airweave repository also has a sample receiver under `examples/webhook-demo`.
