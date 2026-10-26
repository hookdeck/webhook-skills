# Setting Up GlobalStack Webhooks

## Prerequisites

- A GlobalStack integration with an API key (webhook endpoints are managed through the API)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a GlobalStack Webhook Endpoint?

Endpoints are created with the API, subscribed by **category**, and created **inactive**.

1. Create the endpoint. `url` must be HTTPS and `event_categories` is a non-empty list of
   `onramp`, `offramp`, `conversion`, `transfer`, `deposit`, `kyc` (unknown values get a `400`):

   ```bash
   curl -X POST https://api.globalstack.io/v1/notifications/webhooks \
     -H "Authorization: Bearer $GLOBALSTACK_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://example.com/webhooks/globalstack", "event_categories": ["onramp", "conversion"]}'
   ```

   See the [API reference](https://docs.globalstack.io/api-reference/notification-webhooks/create-a-webhook-endpoint)
   for the full request and response schema.

2. Copy `signing_secret` from the response and store it. It is shown in plaintext **once**.
3. Activate the endpoint. Nothing is delivered until you do:

   ```bash
   curl -X PATCH https://api.globalstack.io/v1/notifications/webhooks/{id} \
     -H "Authorization: Bearer $GLOBALSTACK_API_KEY" \
     -H "Content-Type: application/json" -d '{"active": true}'
   ```

4. Return a `2xx` quickly from your handler, and process on a queue. Return `200` for events you
   don't handle.

## Where Do I Find the Signing Secret?

Only in the `signing_secret` field of the create (or rotate) response. It starts with `whsec_`
and each endpoint has its own. Store the full value, prefix included:

```bash
GLOBALSTACK_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Rotating the Secret

Call `POST /v1/notifications/webhooks/{id}/rotate-secret`. It returns a **new** `signing_secret`
in plaintext, once, and you should verify deliveries against the new secret afterwards. GlobalStack's
verification guide notes an endpoint can have more than one valid secret during a rotation, so
`svix-signature` can carry several `v1,` entries; the examples accept any matching entry.

## Debugging and Replaying Deliveries

| You want to | Use |
|-------------|-----|
| See why deliveries fail | `GET /v1/notifications/webhooks/{id}/logs` (attempt history with the status you returned, error, latency) |
| See what is queued | `GET /v1/notifications/webhooks/{id}/events` (pending events, oldest first) |
| Replay a missed event | `POST /v1/notifications/webhooks/{id}/send` with the event's `event_id` as `event_idempotency_key` |

Replay only delivers to an **active** endpoint; an inactive one returns `409 invalid_status`.
A replay reuses the same `event_id`, so deduplication treats it as the same event.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature on ingest and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
