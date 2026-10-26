# Setting Up Hail Webhooks

## Prerequisites

- A Hail account with an API key (`Authorization: Bearer $HAIL_API_KEY`)
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

Subscriptions are created through the API:

```bash
curl -X POST https://api.hail.so/v1/webhooks \
  -H "Authorization: Bearer $HAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_url": "https://example.com/webhooks/hail", "event_types": ["email.received", "email.bounced", "sms.received"]}'
```

List the valid `event_types` with `curl https://api.hail.so/v1/webhooks/event-types` (no API key needed).

## Get Your Signing Secret

The create response returns the signing secret **once**. Save it right away as `HAIL_WEBHOOK_SECRET`. It looks like `whsec_...`, but it is not a Standard Webhooks secret: use the whole string, including `whsec_`, as a plain HMAC key. Do not strip the prefix or base64-decode it.

## Hookdeck Setup

When you receive Hail webhooks through the Hookdeck Event Gateway, paste the whole signing secret, including any `whsec_` prefix, into the source's webhook secret. Hail uses it as a plain HMAC key.

## Local Development

```bash
npx hookdeck-cli listen 3000 hail --path /webhooks/hail
```

Use the Hookdeck URL as the subscription's `target_url`.

## Replaying and Managing

Replay one delivery with `POST /v1/webhooks/<subscription-id>/deliveries/<delivery-id>/redeliver`. A subscription auto-disabled after repeated dead deliveries is re-enabled by setting its `status` to `active`.
