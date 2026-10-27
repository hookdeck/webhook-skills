---
name: thought-industries-webhooks
description: >
  Receive and verify Thought Industries webhooks. Use when configuring Thought Industries webhook
  endpoints, debugging x-ti-hook-signature signatures, or handling courseCompletion, courseEnrollment, quizAttempt.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Thought Industries Webhooks

Receive Thought Industries learning notifications.

## When to Use This Skill

- Configure a receiver for Thought Industries webhook deliveries.
- Diagnose `x-ti-hook-signature` verification failures.
- Handle `courseCompletion`, `courseEnrollment`, `quizAttempt`.

## Setup

Under Users > Manager Notifications, choose a trigger, select the Webhook channel, and configure the URL. Ask Thought Industries Support for your Site Secret. It is distinct from your API key and is not displayed in Admin. Use Test Event to inspect a delivery.

Ask Thought Industries Support for your Site Secret and paste it here.

Set `THOUGHT_INDUSTRIES_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`x-ti-hook-signature` contains `sha256=<hex>` over the raw body. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

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

Read event for the trigger kind, such as courseCompletion or quizAttempt. The X-Ti-Hook-Signature value has a sha256= prefix. Keep learner details out of routine request logs.

Return 200 promptly after accepting the event. Deduplicate repeated notifications using a stable event identifier when available, or an application key based on the documented event fields.

## Local Development

```bash
npx hookdeck-cli listen 3000 thought-industries --path /webhooks/thought-industries
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
