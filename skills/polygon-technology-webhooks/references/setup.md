# Setting Up Polygon Technology OMS Webhooks

OMS webhooks are managed through the API, not a dashboard form. Examples use the sandbox host from the docs, `https://sandbox-api.polygon.technology/v0.13`.

## Prerequisites

- An OMS API key. Access is gated: [request it](https://polygon.technology/get-access) if your project doesn't have one.
- A public HTTPS endpoint. Locally, use the Hookdeck CLI (below).

## 1. Register Your Endpoint

```bash
curl -X POST https://sandbox-api.polygon.technology/v0.13/webhooks \
  -H "Authorization: Bearer {accessToken}" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a" \
  -d '{"url":"https://api.yourapp.com/webhooks/polygon-technology","subscriptions":["*"]}'
```

- `url` must be a public HTTPS endpoint.
- `subscriptions` takes event `type` values from the [catalog](https://docs.polygon.technology/api-reference/webhook-events) (for example `["transaction.statusChanged", "transfer.statusChanged"]`) or `"*"` for all of them. **A type that isn't in the catalog receives nothing**, so a typo silently yields no events. The `transaction.*.underReview` types can't be subscribed to.

## 2. Store the Signing Key

The response returns the cleartext `signingKey`. Store it immediately and set:

```bash
OMS_WEBHOOK_SIGNING_KEY=<signingKey>   # as-is: no prefix to strip, no decoding
```

It's shown once. The only way to read it again is to retry the original `POST /webhooks` with the **same `Idempotency-Key` and the same body**, which replays the response. Reusing the `Idempotency-Key` with a different body returns `422 IdempotencyKeyReuse`.

## 3. Send a Test Delivery

```bash
curl -X POST https://sandbox-api.polygon.technology/v0.13/webhooks/{webhookId}/test \
  -H "Authorization: Bearer {accessToken}" \
  -H "Idempotency-Key: 9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
```

OMS sends a signed test delivery regardless of your subscriptions, so you can check signing and reachability before a real event fires.

Inspect what was sent with `GET /webhooks/{webhookId}/deliveries` (filters: `status`, `test`, `eventId`, `createdAfter`, `createdBefore`). Each record has a `whd_` ID and nests the exact body under `event`. `GET /webhooks/{webhookId}/deliveries/{deliveryId}` adds each HTTP attempt (response status, duration, request body), which tells you whether a failure was your endpoint or the network.

### Local Testing with the Hookdeck CLI

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 polygon-technology --path /webhooks/polygon-technology
# FastAPI
npx hookdeck-cli listen 8000 polygon-technology --path /webhooks/polygon-technology
```

No install or account required. Register the printed HTTPS URL as `url`.

## Rotating the Signing Key

`POST /webhooks/{webhookId}/rotate-key` returns a new key. **The old key stops working immediately, with no overlap window.** Deploy the new key to your verifier at the same moment. Deliveries that arrive in between fail verification; they're retried on the normal schedule (and can be requeued), so they recover once the key matches.

## Managing Webhooks

| Endpoint | Purpose |
|---|---|
| `POST /webhooks`, `GET /webhooks` | Create, list |
| `GET`, `PATCH`, `DELETE /webhooks/{webhookId}` | Read, update (for example `timeoutMs`, `notifyThresholdSecs`), delete |
| `POST /webhooks/{webhookId}/enable`, `/disable` | Change state |
| `POST /webhooks/{webhookId}/rotate-key` | New signing key (no overlap) |
| `POST /webhooks/{webhookId}/test` | Signed test delivery |
| `GET /webhooks/{webhookId}/deliveries[/{deliveryId}]` | Delivery history (30 days) |
| `POST /webhooks/{webhookId}/deliveries/retry` | Requeue deliveries |

`DELETE` is a soft delete: the webhook disappears from list and get, but its delivery history is kept for the retention window.

## Recovering Missed Deliveries

- **Failed deliveries** (10 attempts over ~3 days exhausted): `POST /webhooks/{webhookId}/deliveries/retry` with explicit `deliveryIds`, or a `status` plus a `createdAfter`/`createdBefore` range. A manual retry resets the attempt count.
- **Suspended webhook** (~72 hours of continuous failure): only OMS sets `suspended`, and it never clears on its own. Fix the endpoint, call `POST /webhooks/{webhookId}/enable`, then requeue the `skipped` deliveries with `.../deliveries/retry`.
- **Disabled webhook**: creates no delivery rows, so events fired while disabled are gone. Prefer fixing a suspended endpoint to disabling it.
- **Older than 30 days**: there is no `GET /events`. Read the resource's current state from the API.

## Using Hookdeck

Create a source with the **Polygon Technology** source type and paste the `signingKey` as-is. Hookdeck verifies `Webhook-Signature` (HMAC-SHA256, hex, over `<t>.<body>`). Register the source URL with `POST /webhooks`. If your handler also verifies behind Hookdeck, note that a delivery Hookdeck retries later still carries OMS's original `t`, which your 300 second check will reject once it's old.
