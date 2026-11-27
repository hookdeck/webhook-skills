---
name: gocardless-webhooks
description: >
  Receive and verify GoCardless webhooks. Use when setting up GoCardless webhook
  handlers, debugging Webhook-Signature verification, or handling bank debit events
  like payments confirmed, payments failed, mandates cancelled, and payouts paid.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# GoCardless Webhooks

GoCardless is a bank debit / recurring payments platform. It sends webhooks as
**batches** of events (up to 250 per request) in an `events` array, signed with an
HMAC-SHA256 signature in the `Webhook-Signature` header.

## When to Use This Skill

- How do I receive GoCardless webhooks?
- How do I verify the GoCardless `Webhook-Signature` header?
- Why is my GoCardless webhook signature verification failing?
- How do I handle `payments` `confirmed`/`failed`, `mandates` `cancelled`, or `payouts` `paid` events?
- How do I process the GoCardless `events` array idempotently?

## How GoCardless Signs Webhooks

- **Header:** `Webhook-Signature` — a bare 64-char lowercase hex digest (no `X-`
  prefix, no `sha256=` scheme prefix)
- **Algorithm:** HMAC-SHA256 over the **raw request body**, keyed with the
  webhook endpoint secret (from your GoCardless Dashboard)
- **Key:** use the secret **verbatim as a UTF-8 string** — do NOT base64-decode it
  even though it looks base64url-ish; decoding it produces a wrong signature
- **Encoding:** lowercase **hex** string
- **Comparison:** timing-safe equality
- **Response:** return a `2xx` within 10 seconds (`204 No Content` once the whole
  batch is accepted). Return `498` for a bad signature: GoCardless logs it and
  doesn't retry. Any other non-2xx or a timeout is retried, up to 9 attempts in
  all at increasing intervals, and you can retry from the Dashboard or with
  `POST /webhooks/{id}/actions/retry`. Delivery is at-least-once and the same
  event can appear in more than one webhook, so keep handlers **idempotent on
  `event.id`** (not `meta.webhook_id`, which identifies the delivery attempt).

*(GoCardless's [webhooks reference](https://docs.gocardless.com/docs/api-reference/webhooks)
names the scheme: an HMAC SHA256 hex digest of the raw body, keyed with the
endpoint secret. Also checked in 2026-08 against a live sandbox delivery and the
official `gocardless-nodejs` SDK.)*

Always verify against the **raw body** — parsing JSON first and re-serializing will
change the bytes and break the signature.

## Verification (core)

Use the official `gocardless-nodejs` SDK where it runs (Node.js). `parse()` verifies
the signature (timing-safe) and returns the events array, throwing
`InvalidSignatureError` when the signature does not match.

```javascript
// Node.js — official SDK (gocardless-nodejs), req.body is the RAW Buffer
const { parse, InvalidSignatureError } = require('gocardless-nodejs/webhooks');

try {
  const events = parse(
    req.body,                                  // raw body (Buffer/string), NOT parsed JSON
    process.env.GOCARDLESS_WEBHOOK_SECRET,     // webhook endpoint secret
    req.headers['webhook-signature']           // Webhook-Signature header
  );
  // signature valid — process each event, then respond 204
} catch (err) {
  if (err instanceof InvalidSignatureError) {
    // signature mismatch — respond 498 (do not process)
  }
}
```

GoCardless's other client libraries (Python `gocardless_pro`, Ruby, PHP, Java, .NET,
Go) have the same webhook parser. Without one (as in the FastAPI example), verify
manually — same algorithm, timing-safe compare:

```python
import hmac, hashlib
expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
valid = hmac.compare_digest(expected, signature_header)  # timing-safe
```

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

GoCardless events combine a `resource_type` with an `action`. The most common:

| resource_type | action | Triggered When |
|---------------|--------|----------------|
| `payments` | `confirmed` | Funds confirmed collected from the customer |
| `payments` | `paid_out` | Payment included in a payout to your bank account |
| `payments` | `failed` | Payment failed (e.g. insufficient funds) |
| `payments` | `cancelled` | Payment cancelled |
| `payments` | `charged_back` | Customer charged the payment back |
| `mandates` | `active` | Mandate set up and ready to collect |
| `mandates` | `customer_approval_granted` | Extra customer approval (e.g. a second signatory) granted |
| `mandates` | `cancelled` | Mandate cancelled (e.g. bank account closed) |
| `mandates` | `failed` | Mandate setup failed |
| `mandates` | `expired` | Mandate expired through inactivity |
| `payouts` | `paid` | Payout sent to your bank account |
| `refunds` | `paid` | Refund paid to the customer |
| `refunds` | `failed` | Refund failed |
| `subscriptions` | `created` | Subscription created |
| `subscriptions` | `cancelled` | Subscription cancelled |

See [overview.md](references/overview.md) for the full action list per resource type.

## Environment Variables

```bash
# Webhook endpoint secret from the GoCardless Dashboard (Developers → Webhooks)
GOCARDLESS_WEBHOOK_SECRET=your_webhook_endpoint_secret
```

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 gocardless --path /webhooks/gocardless
```

No account required. The CLI creates a guest account on first run and provides a
local tunnel + web UI for inspecting requests. Use port `8000` for the FastAPI example.

## Reference Materials

- [Overview](references/overview.md) - What GoCardless webhooks are, full event/action list
- [Setup](references/setup.md) - Create a webhook endpoint and copy the secret
- [Verification](references/verification.md) - Signature verification details and gotchas

## Examples

- [Express Example](examples/express/) - Express 5 handler using the GoCardless SDK, with tests
- [Next.js Example](examples/nextjs/) - Next.js App Router route using the GoCardless SDK, with tests
- [FastAPI Example](examples/fastapi/) - Python FastAPI handler with manual HMAC verification, with tests

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one. GoCardless retries failed deliveries (9 attempts in all) and delivers at least once, so idempotency matters. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Prevent duplicate processing (dedupe on `event.id`)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhook handling
- [paddle-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paddle-webhooks) - Paddle billing webhook handling
- [chargebee-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/chargebee-webhooks) - Chargebee subscription billing webhook handling
- [paypal-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paypal-webhooks) - PayPal payment webhook handling
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - Shopify e-commerce webhook handling
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub repository webhook handling
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers
