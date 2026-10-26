# Setting Up Rewardful Webhooks

## Prerequisites

- A Rewardful account with access to the Webhooks page of the dashboard
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 rewardful --path /webhooks/rewardful` locally)

## Register Your Endpoint

1. Open the **Webhooks** page in your Rewardful dashboard.
2. Add an endpoint with your URL, e.g. `https://example.com/webhooks/rewardful`.
3. Select the event types it should receive, e.g. `affiliate.confirmed`, `referral.converted`,
   `commission.created`, `payout.paid`.
4. Save.

## Get Your Signing Secret

Each endpoint has its own **Signing Secret**, shown on the Webhooks page of the dashboard. Store it as:

```bash
REWARDFUL_WEBHOOK_SECRET=your_endpoint_signing_secret
```

Use it as-is (its UTF-8 bytes) as the HMAC key. Do not base64- or hex-decode it.

## Test

Trigger a real event (for example confirm a test affiliate) and check the endpoint. Locally,
replay a signed request with the example tests, or sign one yourself:

```bash
BODY='{"object":{"id":"1"},"event":{"id":"e1","type":"affiliate.confirmed","api_version":"v1"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$REWARDFUL_WEBHOOK_SECRET" -hex | awk '{print $NF}')
curl -X POST http://localhost:3000/webhooks/rewardful \
  -H "Content-Type: application/json" -H "X-Rewardful-Signature: $SIG" -d "$BODY"
```

## Retries

Respond `200` to acknowledge. Any other status is retried with exponential backoff for 3 days,
then the event is dropped.
