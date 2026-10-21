---
name: modern-treasury-webhooks
description: >
  Receive and verify Modern Treasury webhooks. Use when setting up Modern
  Treasury webhook handlers, debugging X-Signature verification (hex
  HMAC-SHA256 of the raw body), routing on the X-Topic header and event field,
  or handling payment operations events like payment_order.completed,
  payment_order.failed, expected_payment.reconciled and
  incoming_payment_detail.completed.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Modern Treasury Webhooks

## When to Use This Skill

- How do I receive Modern Treasury webhooks?
- How do I verify a Modern Treasury webhook signature (`X-Signature`)?
- Why is my Modern Treasury webhook signature verification failing?
- How do I tell a `payment_order` event from an `expected_payment` event? (`X-Topic` header plus body `event`)
- How do I handle `payment_order.completed`, `payment_order.failed` or `payment_order.reconciled`?
- How do I avoid processing the same Modern Treasury webhook twice (`X-Webhook-ID`)?

## Verification (core)

`X-Signature` is the **lowercase hex HMAC-SHA256 of the raw request body**, keyed with your webhook key (Developers > Webhooks) used as a plain string. There is no timestamp and no prefix.

```javascript
const crypto = require('crypto');

function verifySignature(rawBody, signature, webhookKey) {
  if (!signature || !webhookKey) return false;
  const expected = crypto.createHmac('sha256', webhookKey).update(rawBody).digest('hex');
  const received = Buffer.from(signature.trim().toLowerCase());
  const expectedBuf = Buffer.from(expected);
  return received.length === expectedBuf.length &&
    crypto.timingSafeEqual(received, expectedBuf);
}

// Node lowercases header names: read req.headers['x-signature'], not 'X-Signature'
```

Verify against the **raw body bytes**, before any JSON parsing. In Express use `express.raw({ type: '*/*' })`.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

The official SDKs (`modern-treasury` on npm and PyPI) expose `webhooks.validateSignature` / `validate_signature`, but they compare with a plain `===`/`==` and need a configured API client, so the examples verify manually with a timing-safe compare.

## Request Headers and Body

| Header | Meaning |
|--------|---------|
| `X-Signature` | Hex HMAC-SHA256 of the body |
| `X-Topic` | Object category, e.g. `payment_order`, `expected_payment` |
| `X-Webhook-ID` | Unique per webhook, **stable across retries** (use for idempotency) |
| `X-Event-ID` | ID of the Event object |
| `X-Delivery-ID` | Changes on every delivery attempt |
| `X-Live-Mode` | `true` for live traffic, `false` for test |

The body is `{ "event": "completed", "data": { ...the object... } }`. The `event` is the bare event name; combine it with `X-Topic` (`payment_order.completed`) to route.

## Common Event Types

Events are named per topic. Verified against the Modern Treasury docs:

| Topic | Events |
|-------|--------|
| `payment_order` | `created`, `updated`, `approved`, `denied`, `cancelled`, `begin_processing`, `finish_processing`, `acknowledged`, `confirmed`, `tentatively_reconciled`, `completed`, `reconciled`, `returned`, `failed`, `redrafted`, `reversed`, `held`, `resolved` |
| `expected_payment` | `created`, `reconciled`, `partially_reconciled`, `tentatively_reconciled`, `unreconciled`, `overdue`, `archived` |
| `incoming_payment_detail` | `created`, `tentatively_reconciled`, `completed`, `reconciled`, `returned`, `failed`, `return_failed`, `unreconciled` |
| `transaction` | `created`, `reconciled`, `updated` |
| `return` | `created`, `begin_processing`, `finish_processing`, `reconciled`, `completed`, `returned`, `failed`, `unreconciled` |
| `reversal` | `created`, `begin_processing`, `finish_processing`, `completed`, `failed`, `returned`, `unreconciled` |

Other topics: `balance_report`, `case`, `connection_legal_entity`, `decision`, `external_account`, `internal_account`, `ledger_account_settlement`, `ledger_transaction`, `legal_entity`, `user_onboarding`. See `references/overview.md` for the full list.

## Environment Variables

```bash
MODERN_TREASURY_WEBHOOK_KEY=your_webhook_key_here
```

## Local Development

```bash
npx hookdeck-cli listen 3000 modern-treasury --path /webhooks/modern-treasury
```

No account required: the CLI creates a guest account on first run and provides a local tunnel plus a web UI for inspecting requests. Use the printed URL as your endpoint URL in Modern Treasury (sandbox accepts `localhost` URLs directly; production requires HTTPS). Use port `8000` for the FastAPI example.

## Gotchas

- **Raw body only.** Re-serialized JSON changes the bytes and breaks the signature.
- **Lowercase header lookup in Node.** The Modern Treasury docs sample reads `req.headers['X-Signature']`, which is always `undefined`.
- **Respond within 5 seconds with a 2xx.** Otherwise it is retried with exponential backoff, up to 15 attempts; the endpoint is then paused. Acknowledge fast and process async.
- **Duplicates happen.** Retries reuse `X-Webhook-ID`, and a redrafted payment order can emit the same event again for the same `id`.
- **`completed` is not `reconciled`.** Treat a payment order as fully settled at `reconciled`.
- **Same URL for live and test?** Branch on `X-Live-Mode`.
- **Ignore `X-Internal-Signature`.** It is for Modern Treasury's own use.

## Reference Materials

- [references/overview.md](references/overview.md) - Topics, events, headers and payload structure
- [references/setup.md](references/setup.md) - Add a webhook endpoint and find the webhook key
- [references/verification.md](references/verification.md) - Signature details, SDK notes, debugging

## Recommended: webhook-handler-patterns

Install [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) alongside this skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhooks (HMAC-SHA256 with timestamp)
- [adyen-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/adyen-webhooks) - Adyen payment notifications
- [checkout-com-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/checkout-com-webhooks) - Checkout.com payment events
- [airwallex-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/airwallex-webhooks) - Airwallex payments and payouts
- [lithic-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/lithic-webhooks) - Lithic card and payment events
- [revolut-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/revolut-webhooks) - Revolut Business events
- [mollie-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mollie-webhooks) - Mollie payment webhooks
- [bridge-api-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/bridge-api-webhooks) - Bridge stablecoin and payment events
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
