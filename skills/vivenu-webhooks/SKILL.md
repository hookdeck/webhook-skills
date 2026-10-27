---
name: vivenu-webhooks
description: >
  Receive and verify vivenu webhooks. Use when configuring vivenu webhook
  endpoints, debugging x-vivenu-signature signatures, or handling transaction.complete, checkout.completed, ticket.created.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# vivenu Webhooks

Receive vivenu transaction, checkout and ticket events.

## When to Use This Skill

- Configure a receiver for vivenu webhook deliveries.
- Diagnose `x-vivenu-signature` verification failures.
- Handle `transaction.complete`, `checkout.completed`, `ticket.created`.

## Setup

Create a seller-account webhook in Developer > Webhooks or through the API. Select events and set an hmacKey, then configure the same key in the receiver. Trigger an actual event in the dev environment to test; the docs do not offer synthetic test events.

Set an hmacKey on the vivenu webhook. Without one, deliveries are unsigned and fail verification.

Set `VIVENU_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`x-vivenu-signature` contains a bare hex digest over the raw body. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

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

Read type from the {mode, id, type, data} envelope. id identifies the transmission, and mode distinguishes dev and prod. Signing is optional at the sender; enable hmacKey for these verified examples.

Return success within the documented ten-second timeout. Failed deliveries can be retried and can arrive out of order; deduplicate on id.

## Local Development

```bash
npx hookdeck-cli listen 3000 vivenu --path /webhooks/vivenu
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
