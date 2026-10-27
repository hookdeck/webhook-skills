---
name: hifi-webhooks
description: >
  Receive and verify HIFI webhooks. Use when configuring HIFI webhook
  endpoints, debugging hifi-signature signatures, or handling ONRAMP.STATUS.COMPLETED, USER.CREATED, CRYPTO_TRANSFER.CREATED.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# HIFI Webhooks

Receive HIFI user, compliance and money-movement events.

## When to Use This Skill

- Configure a receiver for HIFI webhook deliveries.
- Diagnose `hifi-signature` verification failures.
- Handle `ONRAMP.STATUS.COMPLETED`, `USER.CREATED`, `CRYPTO_TRANSFER.CREATED`.

## Setup

Register an endpoint with the HIFI Webhooks API, set its subscriptions, and store the signingSecret returned at registration. It is shown only once. To replace the secret, delete and register the endpoint again.

Set `HIFI_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`hifi-signature` contains `t=<Unix seconds>,v1=<hex>` over `timestamp + "." + raw body`. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

After extracting the documented digest and constructing `message` as described in [verification](references/verification.md), the comparison is:

```javascript
const expected = crypto.createHmac('sha256', secret).update(message).digest();
if (digest.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(digest)) return false;
const received = Buffer.from(digest, 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

Set `HIFI_WEBHOOK_TOLERANCE_SECONDS` to a positive number to enforce an application age limit in seconds. Unset or `0` disables it. Old timestamps remain valid by default so Hookdeck retries and replays can retain the original headers.

Complete handlers and tests: [Express](examples/express/), [Next.js](examples/nextjs/), [FastAPI](examples/fastapi/).

## Event Handling

The envelope contains id, eventType, eventCreatedAt and data. Use eventType for dispatch; data is the resource state. RESOURCE.CREATED and RESOURCE.STATUS.CREATED are distinct notifications.

Return 2xx promptly. HIFI retries failed deliveries with exponential backoff for up to 10 attempts. Deliveries may arrive out of order; reconcile the resource state before applying a change.

## Local Development

```bash
npx hookdeck-cli listen 3000 hifi --path /webhooks/hifi
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
- [preczn-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/preczn-webhooks): another HMAC receiver.
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns): delivery and processing patterns.
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway): managed delivery and inspection.
