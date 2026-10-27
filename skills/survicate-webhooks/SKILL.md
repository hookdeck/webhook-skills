---
name: survicate-webhooks
description: >
  Receive and verify Survicate webhooks. Use when configuring Survicate webhook
  endpoints, debugging hmac signatures, or handling questionAnswered, surveyCompleted.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Survicate Webhooks

Receive Survicate question answers and completed surveys.

## When to Use This Skill

- Configure a receiver for Survicate webhook deliveries.
- Diagnose `hmac` verification failures.
- Handle `questionAnswered`, `surveyCompleted`.

## Setup

Copy the workspace Signing Secret from Survicate Webhooks Settings. In the survey's Connect tab, configure the webhook URL and choose questionAnswered or surveyCompleted. Use Send sample request to test. The separate Verification Token is sent in plaintext and is not used by this HMAC verifier.

Set `SURVICATE_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`hmac` contains a bare hex digest over the raw body. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

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

The envelope is {messageId, deliveryTries, event: {questionAnswered: {...}}} or the corresponding surveyCompleted key. Dispatch on keys inside event, not on event as a string. The receiver guards each nested value before use.

Use messageId when deduplicating deliveries. Acknowledge accepted events and avoid logging survey answers or personal data.

## Local Development

```bash
npx hookdeck-cli listen 3000 survicate --path /webhooks/survicate
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
