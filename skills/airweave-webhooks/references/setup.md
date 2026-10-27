# Setting Up Airweave Webhooks

## Prerequisites

- An Airweave account. **Creating, updating, deleting and recovering subscriptions needs the admin
  or owner role and Bearer token authentication.** API key auth works for read-only calls
  (listing subscriptions, messages, delivery attempts).
- A publicly reachable **HTTPS** endpoint (HTTP is only allowed for local development; use the
  Hookdeck CLI tunnel for that)

## How Do I Register an Airweave Webhook Endpoint?

Subscriptions are created through the API:

```bash
curl -X POST 'https://api.airweave.ai/webhooks/subscriptions' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "url": "https://your-server.com/webhooks/airweave",
    "event_types": ["sync.completed", "sync.failed", "source_connection.created", "collection.deleted"]
  }'
```

The response holds the subscription `id` (`ep_...`), `url`, `filter_types`, and `disabled: false`.
Pick any of the 11 event types listed in [overview.md](overview.md). Return a `2xx` quickly from
your handler and process on a queue. There is no challenge or handshake.

## Where Do I Find the Signing Secret?

The secret is per subscription. Fetch it with `include_secret=true`:

```bash
curl -X GET 'https://api.airweave.ai/webhooks/subscriptions/{subscription_id}?include_secret=true' \
  -H 'x-api-key: YOUR_API_KEY'
```

The response includes a `secret` field in the format `whsec_...`. Store the full value, prefix
included:

```bash
AIRWEAVE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

You may supply your own `secret` (minimum 24 characters) when creating the subscription. Hookdeck's
configuration alert for this source says: "If you set a custom secret, paste the whsec_ secret
Airweave returns for the subscription, not the value you sent." So still fetch the subscription with
`include_secret=true` and use the returned `whsec_...` value as `AIRWEAVE_WEBHOOK_SECRET`. The
examples reject a value that doesn't start with `whsec_` with a 500 instead of verifying with the
wrong key.

## Managing a Subscription

| You want to | Call |
|-------------|------|
| Pause delivery | `PATCH /webhooks/subscriptions/{id}` with `{"disabled": true}` |
| Resume and replay failures | `PATCH` with `{"disabled": false, "recover_since": "2025-01-15T00:00:00Z"}` |
| Change URL or events | `PATCH` with `url` or `event_types` |
| Replay failed messages | `POST /webhooks/subscriptions/{id}/recover` with `since` (required) and `until` |
| See why deliveries fail | `GET /webhooks/messages/{message_id}?include_attempts=true` |
| Delete | `DELETE /webhooks/subscriptions/{id}` (pending deliveries are cancelled) |

Recovery replays failed messages in chronological order.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature on ingest and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
