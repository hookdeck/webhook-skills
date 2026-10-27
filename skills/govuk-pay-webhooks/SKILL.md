---
name: govuk-pay-webhooks
description: >
  Receive and verify GOV.UK Pay webhooks. Use when configuring GOV.UK Pay webhook
  endpoints, debugging pay-signature signatures, or handling card_payment_captured, card_payment_succeeded, card_payment_refunded.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# GOV.UK Pay Webhooks

Receive GOV.UK Pay card-payment updates.

## When to Use This Skill

- Configure a receiver for GOV.UK Pay webhook deliveries.
- Diagnose `pay-signature` verification failures.
- Handle `card_payment_captured`, `card_payment_succeeded`, `card_payment_refunded`.

## Setup

In the GOV.UK Pay admin tool, open Settings > Developers > Webhooks, configure the endpoint and events, and use View to reveal this webhook's signing secret. Live callbacks require HTTPS with TLS 1.2 and a .gov.uk domain. Exceptions require support approval and a domain owned by your service or parent organisation. Use public tunnel URLs only for sandbox or not-live-yet testing; confirm an approved callback domain before live Hookdeck routing.

Set `GOVUK_PAY_WEBHOOK_SECRET` in the server environment. Read [setup](references/setup.md) before enabling delivery.

## Verification (core)

`pay-signature` contains a bare hex digest over the raw body. Use HMAC-SHA256 with the secret's UTF-8 bytes. Verify the original bytes before parsing JSON. Validate the digest format, then compare equal-length buffers in constant time.

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

Read event_type from the body. webhook_message_id identifies the message. Verify Pay-Signature with the signing secret as UTF-8 bytes, preserving the body bytes exactly without adding a BOM.

Return 2xx promptly. Messages may arrive more than once and out of order; deduplicate using webhook_message_id and reconcile payment state before applying updates.

## Local Development

```bash
npx hookdeck-cli listen 3000 govuk-pay --path /webhooks/govuk-pay
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
