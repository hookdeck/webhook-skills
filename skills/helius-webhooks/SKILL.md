---
name: helius-webhooks
description: >
  Receive and authenticate Helius Solana webhooks. Use when setting up Helius
  webhook handlers, checking the authHeader (Authorization header) on incoming
  requests, or handling enhanced transaction events like NFT_SALE, SWAP and TRANSFER.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Helius Webhooks

## When to Use This Skill

- How do I receive Helius webhooks?
- How do I authenticate Helius webhook requests? (Helius does not sign payloads)
- How do I use the Helius `authHeader` and check the `Authorization` header?
- How do I handle `NFT_SALE`, `SWAP` or `TRANSFER` enhanced transaction events?
- Why am I receiving duplicate Helius webhook events, or why was my webhook auto-disabled?

## Authentication (core)

Helius webhooks have **no signature**: there is no HMAC, no timestamp and no signing secret. The optional `authHeader` you set when creating the webhook (for example `Bearer your-secret-token`) is sent **verbatim** as the `Authorization` header on every delivery. Compare the **whole header value** in constant time. The `signature` field in the payload is the Solana transaction signature, not a webhook signature.

```javascript
const crypto = require('crypto');

// Hash both sides so timingSafeEqual always gets equal-length buffers
function verifyHeliusAuth(received, expected) {
  if (!received || !expected) return false;
  const a = crypto.createHash('sha256').update(received).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Authorization header must equal the authHeader you registered, exactly
verifyHeliusAuth(req.headers.authorization, process.env.HELIUS_AUTH_HEADER);
```

The body is an **array** of transactions. Enhanced webhooks give each item a `type` (`NFT_SALE`, `SWAP`, `TRANSFER`, ...); raw webhooks omit `type`. Respond `200` quickly (Helius expects it within 1 second) and process asynchronously, and de-duplicate on the transaction `signature` because deliveries can repeat.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

Enhanced webhooks label each transaction with a type you choose in `transactionTypes` (or `ANY`):

| Event (`type`) | Triggered When | Common Use Cases |
|----------------|----------------|------------------|
| `NFT_SALE` | An NFT is sold on a marketplace | Sales feeds, analytics |
| `SWAP` | A token swap executes | Trading bots, portfolio tracking |
| `TRANSFER` | SOL or tokens move between accounts | Deposit detection, wallet monitoring |
| `NFT_LISTING` | An NFT is listed for sale | Listing alerts |
| `NFT_MINT` | An NFT is minted | Mint tracking |
| `TOKEN_MINT` | A token is minted (limited programs) | Token launch monitoring |

See [references/overview.md](references/overview.md) for the full picture and Helius's [transaction types list](https://www.helius.dev/docs/webhooks/transaction-types) for every value.

## Environment Variables

```bash
# Must match the authHeader set on the Helius webhook exactly, e.g. "Bearer <random-token>"
HELIUS_AUTH_HEADER=Bearer your-secret-token
```

## Local Development

For local webhook testing, use Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 helius --path /webhooks/helius
```

No account required. Provides local tunnel + web UI for inspecting requests. Helius can't reach `localhost`, so point the webhook at the Hookdeck URL.

## Reference Materials

- [Overview](references/overview.md) - What Helius webhooks are, webhook types, common transaction types, payload shape
- [Setup](references/setup.md) - Create a webhook in the Helius dashboard or API and set `authHeader`
- [Verification](references/verification.md) - Authorization header check, gotchas, retries

## Examples

- [Express Example](examples/express/) - Complete Express.js implementation with tests
- [Next.js Example](examples/nextjs/) - Next.js App Router implementation with tests
- [FastAPI Example](examples/fastapi/) - Python FastAPI implementation with tests

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Prevent duplicate processing
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [alchemy-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/alchemy-webhooks) - Alchemy blockchain webhook handling
- [chargebee-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/chargebee-webhooks) - Chargebee webhooks using Basic Auth instead of signatures
- [airtable-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/airtable-webhooks) - Airtable webhook handling
- [circle-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/circle-webhooks) - Circle stablecoin and payments webhook handling
- [coinbase-commerce-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/coinbase-commerce-webhooks) - Coinbase Commerce crypto payment webhooks
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhook handling
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub repository webhook handling
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers
