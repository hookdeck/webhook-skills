# Setting Up Swipelux Webhooks

## Prerequisites

- A Swipelux account and an API key. Creating or changing endpoints and opening the portal's
  retry/replay needs `webhooks:write`; reading endpoints needs `webhooks:read`.
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI tunnel for local work).
- A v3 integration. Hookdeck's configuration alert for this source reads: "Only new Swipelux webhook
  integrations, delivered by Svix, are supported. Legacy integrations use a different scheme and fail
  verification." Choose v3 event names for new subscriptions.

## How Do I Register a Swipelux Webhook Endpoint?

Create an endpoint with `POST /v3/webhooks`, subscribing only to the events you need. Send an
`Idempotency-Key` header.

```bash
export API_BASE='https://platform.swipelux.com'
export SWIPELUX_API_KEY='replace-with-your-api-key'

curl --request POST "${API_BASE}/v3/webhooks" \
  --header "X-API-Key: ${SWIPELUX_API_KEY}" \
  --header "Idempotency-Key: webhook-endpoint-001" \
  --header "Content-Type: application/json" \
  --data '{"url": "https://example.com/webhooks/swipelux", "events": ["transfer.state_changed"]}'
```

Store the response `data.id` as the webhook id. No challenge or validation request is documented,
so there is no handshake to answer.

## Where Do I Find the Signing Secret?

1. Call `GET /v3/webhooks/portal` with an API key that has `webhooks:write`. It returns a link to
   the Svix app portal.
2. Open the link and reveal this endpoint's signing secret. The link grants access on its own and
   expires after one hour, so request a new one each time and don't store or share it.
3. Store the full `whsec_...` value separately from your API key, in a secret manager:

```bash
SWIPELUX_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

Swipelux doesn't print the secret's form in its docs, but Svix secrets start with `whsec_`. If the
value doesn't, the examples reject it with a 500 instead of verifying with the wrong key. An
endpoint's read responses (`GET /v3/webhooks/{webhookId}`) never include the signing secret.

## How Do I Change an Endpoint's Events?

`PATCH /v3/webhooks/{webhookId}` (with an `Idempotency-Key`, `webhooks:write`):

- Send only `events` to keep the current URL, or only `url` to keep the event selection.
- `events` **replaces the whole selection**. Read the endpoint first and include every event you
  still need.
- New subscriptions must use v3 event names. An endpoint may keep a legacy name it already has;
  adding a new legacy name returns `400 validation_error`.

```json
{ "events": ["transfer.state_changed", "capability.status_changed"] }
```

The v3 events are: `customer.created`, `customer.updated`, `customer.archived`,
`capability.created`, `capability.status_changed`, `application.status_changed`,
`recipient.status_changed`, `destination.status_changed`, `account.created`,
`account.status_changed`, `account.details_changed`, `transfer.state_changed`.

## How Do I Recover Missed Deliveries?

Open the portal (`GET /v3/webhooks/portal`) to see delivery logs. With `webhooks:write` you can
retry failed deliveries or start a manual replay; a key with only `webhooks:read` can see deliveries
but cannot retry, replay or reveal secrets. Every replay must pass through the same signature
verification and durable inbox. After downtime, replay the affected window and refetch each
referenced resource. Completed event ids remain no-ops.

If you verify behind Hookdeck, note that retries and replays resend the original timestamp, which
the `svix` library rejects after 5 minutes. See [verification.md](verification.md).

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or the secret belongs to a different endpoint |
| No deliveries arrive | The endpoint isn't subscribed to the event (remember `PATCH` replaces the selection), or the URL isn't reachable |
| Legacy-style events fail verification | The integration is a legacy one; only new Svix-delivered integrations are supported |
| 500 "Server configuration error" | `SWIPELUX_WEBHOOK_SECRET` is unset or doesn't start with `whsec_` |
