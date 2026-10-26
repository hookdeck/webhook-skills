# Setting Up Nium Webhooks

## Prerequisites

- A Nium client account (sandbox or production) and a Nium representative or support contact
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 nium --path /webhooks/nium`)

## Register Your Endpoint

Nium takes your webhook URL as part of client setup; give it to your Nium representative (the
docs use the form `https://<customerHost:Port>/webhook`). Nium then sends a `POST` to that URL for
each event you are subscribed to. Do not assume a self-service dashboard screen for this: ask
Nium how to change the URL for your environment.

## Add the Static Header

Nium has no signing secret. Instead, ask Nium to add a **static header** to every webhook as part
of client setup:

1. Choose a header name. Nium's docs use `x-partner-key` as the example; any agreed name works.
2. Choose a long, random value (for example `openssl rand -hex 32`). A prefix such as `Bearer `
   is allowed if you want one, but you must then include it in your configured secret.
3. Give both to Nium, and store them as `NIUM_WEBHOOK_HEADER` and `NIUM_WEBHOOK_SECRET`.

```bash
NIUM_WEBHOOK_HEADER=x-partner-key
NIUM_WEBHOOK_SECRET=<exact whole header value, including any 'Bearer ' prefix>
```

Use separate values for sandbox and production.

## Choose Events and Retries

Delivery is at most once by default. If you need retries for important events (for example card
wallet funding), ask your Nium representative to enable them per event. Retried deliveries repeat
the `x-request-id` header, so deduplicate on it.

## Test

Replay an event with curl:

```bash
curl -X POST http://localhost:3000/webhooks/nium \
  -H "Content-Type: application/json" \
  -H "x-partner-key: $NIUM_WEBHOOK_SECRET" \
  -H "x-request-id: 123e4567-e89b-12d3-a456-426655440000" \
  -d '{"customerHashId":"0de1e512-e0d7-4eca-ad41-dd39325facc2","systemReferenceNumber":"RT1343085439","template":"REMIT_TRANSACTION_PAID_WEBHOOK"}'
```

Nium's sandbox and simulation APIs can trigger real test events for payouts, onboarding and cards.

## Network Notes

Nium's docs don't publish sending IP ranges for webhooks, so rely on the static header (and
HTTPS) rather than an allowlist unless Nium gives you addresses.
