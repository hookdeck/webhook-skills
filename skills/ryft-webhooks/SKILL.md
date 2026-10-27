---
name: ryft-webhooks
description: >
  Receive and verify Ryft webhooks. Use when configuring Ryft webhook
  endpoints, debugging Signature header verification, or handling PaymentSession.captured, Payout.created, Account.updated.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Ryft Webhooks

Receive Ryft payment-session, payout and account notifications.

## When to Use This Skill

- Configure a receiver for Ryft webhook deliveries.
- Diagnose `signature` verification failures.
- Handle `PaymentSession.captured`, `Payout.created`, `Account.updated`.

## Setup

Use the Ryft Portal profile menu > Developer > Webhooks, or the Webhook API, to register the endpoint and obtain its secret. Configure test and live credentials separately.

Set `RYFT_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`signature` contains a bare hex digest over the raw body. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

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

Read eventType from the envelope; data contains the affected resource. Verify the generic Signature header as a bare hex digest. The guide names HMAC-SHA256; Ryft's .NET SDK supplies the hex encoding detail. Its ASCII secret encoding agrees with UTF-8 for the supplied ASCII secrets.

Return 200 within 1.5 seconds. Ryft documents six attempts, separated by delays of 0, 1, 5, 10, 10 and 10 minutes. Queue durable work before acknowledging.

## Local Development

```bash
npx hookdeck-cli listen 3000 ryft --path /webhooks/ryft
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
