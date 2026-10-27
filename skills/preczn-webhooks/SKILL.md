---
name: preczn-webhooks
description: >
  Receive and verify Preczn webhooks. Use when configuring Preczn webhook
  endpoints, debugging x-preczn-signature signatures, or handling transaction.approved, transaction.declined, merchant.created.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Preczn Webhooks

Receive Preczn transaction and merchant notifications.

## When to Use This Skill

- Configure a receiver for Preczn webhook deliveries.
- Diagnose `x-preczn-signature` verification failures.
- Handle `transaction.approved`, `transaction.declined`, `merchant.created`.

## Setup

Create a Test-mode or Live-mode webhook subscription. Copy its signing secret from the create response or reveal it under Settings > Webhooks. Use the secret for that subscription and mode.

Set `PRECZN_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`x-preczn-signature` contains `v1=<hex>` over the raw body. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

After extracting the documented digest and constructing `message` as described in [verification](references/verification.md), the comparison is:

```javascript
const expected = crypto.createHmac('sha256', secret).update(message).digest();
if (digest.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(digest)) return false;
const received = Buffer.from(digest, 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

No timestamp is included in the signed message. These examples do not invent an age check from unsigned fields.

Complete handlers and tests: [Express](examples/express/), [Next.js](examples/nextjs/), [FastAPI](examples/fastapi/).

## Event Handling

The envelope contains id, webhookId, eventType and data. Multiple comma-separated v1 signatures can be present during secret rotation; any matching v1 signature authenticates the request.

Respond with 2xx within five seconds. Preczn retries 5xx responses and transport failures up to three times, but does not retry 4xx. Deduplicate retries by id; dashboard resends have a new id, so also make the business operation idempotent.

## Local Development

```bash
npx hookdeck-cli listen 3000 preczn --path /webhooks/preczn
```

Use port 8000 for FastAPI. The CLI provides a local tunnel and inspection UI; no account is required to start.

## Resources

- [Overview and event routing](references/overview.md)
- [Endpoint and secret setup](references/setup.md)
- [Verification and troubleshooting](references/verification.md)

## Recommended: webhook-handler-patterns

Use the patterns skill for [handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md), [idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md), [error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) and [retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md).

## Related Skills

- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks): another HMAC receiver.
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks): another HMAC receiver.
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks): another HMAC receiver.
- [gitbook-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/gitbook-webhooks): another HMAC receiver.
- [dub-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/dub-webhooks): another HMAC receiver.
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns): delivery and processing patterns.
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway): managed delivery and inspection.
