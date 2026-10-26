# Setting Up NextPay Webhooks

## Prerequisites

- A NextAPI client ID and client secret (webhooks are managed through the API, with Basic auth)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)
- A NextAPI sandbox account for testing before real transactions

## How Do I Register a NextPay Webhook?

Register one URL per webhook with `POST /v2/webhooks`, and list the events you want in `events`:

```bash
curl -u "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" \
  -X POST "https://api.partners.nextpay.world/v2/webhooks" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-domain.com/webhooks/nextpay",
    "events": ["v2.payment_intent.succeeded", "payout_request.processed", "payout.failed"]
  }'
```

The response includes the webhook `id` and the `secret`. NextPay's docs don't describe a
challenge or validation request, so the endpoint only has to accept `POST` and answer `2xx`.

To point an existing webhook at a new URL (for example a tunnel), `PATCH /v2/webhooks/{id}` with
`{"url": "https://..."}`.

## Where Do I Find the Signing Secret?

Only in the `secret` field of the `POST /v2/webhooks` response. It is shown once, starts with
`whsec_`, and is `whsec_<base64>`. Store the full value, prefix included:

```bash
NEXTPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

NextPay's guides name the variable `NEXTAPI_WEBHOOK_SECRET`; these examples use
`NEXTPAY_WEBHOOK_SECRET`. If the value doesn't start with `whsec_`, the examples reject it with a
500 instead of verifying with the wrong key.

## What Should My Endpoint Do?

- Accept `POST` and return a `2xx` within 30 seconds. Slower responses count as failed.
- Verify the signature on the **raw body** before parsing JSON.
- Acknowledge quickly and process on a queue. Return `2xx` for events you don't handle.
- Deduplicate on `svix-id`: deliveries are at-least-once.

## Test Locally

```bash
npx hookdeck-cli listen 3000 nextpay --path /webhooks/nextpay
```

Register the tunnel URL in the sandbox (`POST /v2/webhooks`, or `PATCH` an existing webhook),
trigger a test payment, and check that your signature check passes.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature on ingest and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
