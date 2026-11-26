---
name: ascend-webhooks
description: >
  Receive and verify Ascend webhooks. Use when setting up Ascend webhook
  handlers, debugging Ascend signature verification (X-Ascend-Signature,
  HMAC-SHA256), or handling insurance payment events like invoice.paid,
  payout.paid, and refund.paid.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Ascend Webhooks

Ascend (insurance payments / premium financing) sends webhooks so your app is
notified when an event happens — for example when an invoice is paid. Ascend
POSTs a JSON payload over HTTPS and signs it with an HMAC-SHA256 signature you
must verify before trusting the event.

## When to Use This Skill

- How do I receive Ascend webhooks?
- How do I verify Ascend webhook signatures?
- How do I parse the `X-Ascend-Signature` header?
- How do I handle `invoice.paid` (or payout / refund) events?
- Why is my Ascend webhook signature verification failing?

## How Ascend Signs Webhooks

Ascend uses a **custom Stripe-style HMAC-SHA256 scheme** (not Svix, not
Standard Webhooks). Two headers are sent:

| Header | Example | Purpose |
|--------|---------|---------|
| `X-Ascend-Signature` | `t=1657323346,v1=c159a974c8...` | Timestamp + HMAC signature |
| `X-Ascend-Request-Timestamp` | `1657323346` | The same Unix timestamp, which is signed |

The signature is verified by:

1. Parse `X-Ascend-Signature` into `t` (timestamp) and `v1` (hex HMAC).
2. Build the signed string as `` `${t}:${rawBody}` `` — the timestamp, a **colon**, then the **raw request body**.
3. Compute `HMAC-SHA256(signed_string, webhook_secret)` and hex-encode it.
4. Constant-time compare against `v1`.

> **Use the raw request body.** Re-serializing the parsed JSON (key reordering,
> whitespace) changes the bytes and breaks the signature. There is no official
> Ascend SDK, so every framework below verifies manually.

## Verification (core)

```javascript
const crypto = require('crypto');

// Verify Ascend's "t=<timestamp>,v1=<hex>" signature over "<timestamp>:<rawBody>".
function verifyAscendSignature(rawBody, signatureHeader, secret) {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => p.split('=').map((s) => s.trim()))
  );
  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}:${rawBody}`) // colon separator + RAW body
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false; // length mismatch = invalid
  }
}
```

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Event Payload Structure

Every event has the same top-level shape. Unlike Stripe, `data` **is** the
resource object directly (there is no `data.object` wrapper):

```json
{
  "id": "ajskljfaklsjd0912132",
  "type": "invoice.paid",
  "data": {
    "id": "684c8c8e-75eb-4134-925a-cb3a30f23633",
    "status": "paid",
    "payee": "John Doe Trucking",
    "payer_name": "John Doe",
    "total_amount_cents": 600000,
    "invoice_number": "II2DH1HGHJ",
    "paid_at": "2023-10-01T23:51:37.507Z"
  }
}
```

## Common Event Types

| Event | Triggered When |
|-------|----------------|
| `invoice.created` | An invoice is created |
| `invoice.processing_payment` | An invoice payment is being processed |
| `invoice.paid` | An invoice is paid |
| `invoice.voided` | An invoice is voided |
| `invoice.marked_overdue` | An invoice is marked overdue |
| `payout.paying` | A payout is being paid out |
| `payout.paid` | A payout has been paid |
| `payout.on_hold` | A payout is placed on hold |
| `payout.canceled` | A payout is canceled |
| `payout.failed` | A payout failed |
| `refund.paid` | A refund has been paid |
| `refund.cancelled` | A refund was cancelled |

Always branch on the `type` field and handle unknown types gracefully. See
[references/overview.md](references/overview.md) for the full list and payloads.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ASCEND_WEBHOOK_SECRET` | The webhook signing secret provided by Ascend |

## Setup

Ascend webhook registration is **manual** — there is no self-serve dashboard.
Email `developers@useascend.com` with your organization, environment
(sandbox/production), the events you want, and your HTTPS endpoint URL. Ascend
returns a webhook signing secret. See [references/setup.md](references/setup.md).

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 ascend --path /webhooks/ascend
```

No account required — the CLI creates a guest account on first run and provides
a local tunnel + web UI for inspecting requests.

## Reference Materials

- [overview.md](references/overview.md) — What Ascend webhooks are, event types, payload structure
- [setup.md](references/setup.md) — Registering your endpoint and getting the signing secret
- [verification.md](references/verification.md) — Signature verification details and gotchas
- [examples/express/](examples/express/) — Express (Node.js) example with tests
- [examples/nextjs/](examples/nextjs/) — Next.js App Router example with tests
- [examples/fastapi/](examples/fastapi/) — FastAPI (Python) example with tests

## Recommended: webhook-handler-patterns

Install [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns)
alongside this skill for cross-cutting concerns:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe's HMAC-SHA256 `t=,v1=` scheme (Ascend mirrors this style)
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - HMAC-SHA256 signature verification
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - HMAC-SHA256 with Base64 encoding
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
