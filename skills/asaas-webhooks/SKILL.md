---
name: asaas-webhooks
description: >
  Receive and authenticate Asaas (Brazilian payments) webhooks. Use when setting up
  Asaas webhook handlers, debugging the asaas-access-token header or authToken
  check, or handling payment events like PAYMENT_CREATED, PAYMENT_RECEIVED,
  PAYMENT_CONFIRMED, and PAYMENT_OVERDUE.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Asaas Webhooks

## When to Use This Skill

- How do I receive Asaas webhooks?
- How do I verify an Asaas webhook? Why is my `asaas-access-token` check failing?
- How do I handle `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, or `PAYMENT_OVERDUE` events?
- How do I stop processing duplicate Asaas webhook events?
- Why did Asaas pause my webhook queue?

## Verification (core)

Asaas webhooks are **not signed**. There is no HMAC and no timestamp. When you create the
webhook you choose an **authToken** (32-255 characters, no whitespace, and not your Asaas API key).
Asaas sends it unchanged in the **`asaas-access-token`** header on every delivery, so
verification is a constant-time comparison against the token you stored.

```javascript
const crypto = require('crypto');

function verifyAsaasToken(receivedToken, expectedToken) {
  if (!receivedToken || !expectedToken) return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers.
  const a = crypto.createHash('sha256').update(receivedToken).digest();
  const b = crypto.createHash('sha256').update(expectedToken).digest();
  return crypto.timingSafeEqual(a, b);
}

// header: req.headers['asaas-access-token'], secret: process.env.ASAAS_WEBHOOK_TOKEN
```

Check the token **before** parsing or acting on the body, then dedupe on the event `id`
(delivery is at-least-once) and answer `200` quickly. Asaas pauses the queue after 15
consecutive failures.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

The payload is `{ id, event, dateCreated, account, payment }` (the resource key is `subscription`,
`transfer`, or `invoice` for those families).

| Event | Triggered When |
|-------|----------------|
| `PAYMENT_CREATED` | A new charge is generated |
| `PAYMENT_CONFIRMED` | Payment made, balance not yet available |
| `PAYMENT_RECEIVED` | Charge received, amount available in the account |
| `PAYMENT_OVERDUE` | Charge overdue |
| `PAYMENT_REFUNDED` | Charge refunded |
| `SUBSCRIPTION_CREATED` | A new subscription is created |
| `TRANSFER_DONE` | A transfer is completed |

See [references/overview.md](references/overview.md) for the full list.

## Environment Variables

```bash
ASAAS_WEBHOOK_TOKEN=your_32_to_255_char_auth_token   # the authToken set on the webhook
```

## Local Development

```bash
npx hookdeck-cli listen 3000 asaas --path /webhooks/asaas
```

No account required: the CLI creates a guest account on first run and provides a local tunnel plus a web UI for inspecting requests. Use port `8000` for the FastAPI example.

## Reference Materials

- [references/overview.md](references/overview.md) - What Asaas webhooks are, payload shape, event list
- [references/setup.md](references/setup.md) - Create the webhook and authToken, send type, IP allowlist
- [references/verification.md](references/verification.md) - Token check details and gotchas

## Recommended: webhook-handler-patterns

Install [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns)
alongside this skill for cross-cutting concerns:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [paystack-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paystack-webhooks) - Payments webhooks for African markets
- [razorpay-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/razorpay-webhooks) - Payments webhooks for India
- [mollie-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mollie-webhooks) - European payments webhooks
- [paypal-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paypal-webhooks) - PayPal payment events
- [airwallex-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/airwallex-webhooks) - Cross-border payments
- [checkout-com-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/checkout-com-webhooks) - Payment gateway events
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment events with HMAC signatures
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
