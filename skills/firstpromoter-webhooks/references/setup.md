# Setting Up FirstPromoter Webhooks

Covers Webhooks v2 only: add a custom header to the subscription and enter it here. Legacy webhooks cannot send custom headers.

## Prerequisites

- A FirstPromoter account with access to **Settings > Integrations > Webhooks**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 firstpromoter --path /webhooks/firstpromoter` locally)

## Choose Your Secret Header

FirstPromoter does not generate a signing secret. You invent a header and a value and add them
to the subscription, then give the same two things to your endpoint:

| Setting | Example | Where it goes |
|---------|---------|---------------|
| Header name | `Authorization` (or `X-Webhook-Secret`) | `FIRSTPROMOTER_WEBHOOK_HEADER` (default `Authorization`) |
| Header value | `Bearer 5f1c...` | `FIRSTPROMOTER_WEBHOOK_SECRET` |

The value is compared **whole and exactly**, including any `Bearer ` prefix you typed. Use a long
random value (for example `openssl rand -hex 32`).

## Register Your Endpoint

1. Go to **Settings > Integrations > Webhooks** and click **Add new webhook**.
2. Enter the endpoint **url** (HTTPS), e.g. `https://example.com/webhooks/firstpromoter`.
3. Choose the **event_types**, e.g. `promoter.created`, `referral.converted`,
   `commission.approved`, `payout.completed`.
4. Optionally limit **campaign_ids** (the default `[1]` means all campaigns).
5. Add the custom **headers** object, e.g. `{ "Authorization": "Bearer 5f1c..." }`.
6. Leave **active** on and save.

## Test

Use **Send test** on the subscription. The test payload has `"data": { "test": true }`. Or replay
with curl:

```bash
curl -X POST http://localhost:3000/webhooks/firstpromoter \
  -H "Content-Type: application/json" \
  -H "Authorization: $FIRSTPROMOTER_WEBHOOK_SECRET" \
  -d '{"event_id":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","event_type":"promoter.created","action":"created","entity_type":"promoter","entity_id":12345,"changes":{},"data":{"id":12345,"email":"jane@example.com"},"timestamp":"2025-01-15T10:30:00Z"}'
```

Delivery history (status, response code, first 1,000 characters of your response) is under the
subscription in the dashboard, with a manual **Retry**.

## Rotating the Secret

Edit the subscription's headers and update `FIRSTPROMOTER_WEBHOOK_SECRET` together. Deliveries
sent in between fail with 401 and are retried.
