---
name: uppromote-webhooks
description: >
  Receive and verify UpPromote webhooks. Use when configuring UpPromote webhook
  endpoints, debugging x-uppromote-signature signatures, or handling referral.new, affiliate.approved, payment.paid.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# UpPromote Webhooks

Receive UpPromote referral, affiliate and payment notifications.

## When to Use This Skill

- Configure a receiver for UpPromote webhook deliveries.
- Diagnose `x-uppromote-signature` verification failures.
- Handle `referral.new`, `affiliate.approved`, `payment.paid`.

## Setup

Create a subscription for one topic and URL through the UpPromote API. After the first subscription, find the store Secret Key under Settings > Integrations > Get Secret Key. Set UPPROMOTE_WEBHOOK_TOPIC to the topic subscribed to this example URL; use a separate receiver configuration for another topic.

Set `UPPROMOTE_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`x-uppromote-signature` contains a bare hex digest over the raw body. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

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

Payloads have no event-name discriminator. This example routes by its configured subscription topic, never an invented event field. The header is X-UpPromote-Signature; the Ruby sample's HTTP_X_SIGNATURE is inconsistent with the documented header.

Return success for accepted deliveries. Keep business changes idempotent and retain the subscription topic with queued work.

## Local Development

```bash
npx hookdeck-cli listen 3000 uppromote --path /webhooks/uppromote
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
