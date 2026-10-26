---
name: paytabs-webhooks
description: >
  Receive and verify PayTabs webhooks. Use when setting up PayTabs (MENA
  payment gateway) callback or IPN handlers, debugging the Signature header
  HMAC-SHA256 verification, or handling transaction notifications by tran_type
  (Sale, Refund) and payment_result.response_status.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# PayTabs Webhooks

## When to Use This Skill

- How do I receive PayTabs callback or IPN webhooks?
- How do I verify the `Signature` header on a PayTabs webhook?
- Why is my PayTabs webhook signature verification failing?
- Which key signs PayTabs webhooks (the profile ServerKey)?
- How do I tell a `Sale` from a `Refund`, or an authorised payment from a declined one?
- How do I run PayTabs webhooks through Hookdeck?

## Verification (core)

Every callback and IPN request carries a `Signature` header. It is the bare lowercase **hex** HMAC-SHA256 of the **raw request body bytes**, keyed with your profile ServerKey (its UTF-8 bytes, used as-is). No prefix, timestamp or id is signed, and there is no official verification SDK, so verification is manual.

Node:

```javascript
const crypto = require('crypto');

function verifyPayTabsSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !secret) return false;
  // Buffer.from(x, 'hex') silently drops bad characters: check the format first
  if (!/^[0-9a-f]{64}$/i.test(header)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
}
```

Python:

```python
import hashlib, hmac, re

def verify_paytabs_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    if not header or not secret:
        return False
    if not re.fullmatch(r"[0-9a-f]{64}", header, re.IGNORECASE | re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header.lower().encode("ascii"), expected.encode("ascii"))
```

> In Express, read the raw body with `express.raw({ type: '*/*' })` so any content type verifies. Parse the JSON only after the check passes.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

Respond `401` for a missing, empty or malformed header and for a mismatch. Only server-to-server callback (IPN) requests are covered: the browser Return URL puts its signature in a `signature` form field over sorted parameters and is not a webhook.

## Events

There is no event name in the body or in a header. Every callback and IPN is the full transaction as JSON, so dispatch on the transaction itself:

| Field | Meaning |
|-------|---------|
| `tran_type` | Transaction type, for example `Sale`, `Refund` |
| `payment_result.response_status` | Outcome: `A` is authorised (the docs sample shows `D` for a declined payment) |
| `payment_result.response_message` | Human-readable outcome |
| `tran_ref` | PayTabs transaction reference, for dedupe |

The IPN fires whenever a transaction is created or changes. The callback fires once per payment request when the payment ends, whatever the customer did. See [references/overview.md](references/overview.md).

## Environment Variables

```bash
PAYTABS_WEBHOOK_SECRET=your_profile_server_key
```

## Setup (PayTabs and Hookdeck)

The signing secret is your profile **ServerKey**, the same key you use to call the PT2 API. There is no separate webhook secret. Set the callback URL on the payment request, or the IPN listener URL on the profile, to your endpoint. The URL must be public HTTPS, and a framework with CSRF protection must exempt the route.

For the Hookdeck source: Paste your PayTabs profile server key. Only callback (IPN) requests are supported, not the browser return URL.

PayTabs does not document retries, a timeout or the expected response, so reply `2xx` quickly and make handlers idempotent. See [references/setup.md](references/setup.md).

## Local Development

```bash
npx hookdeck-cli listen 3000 paytabs --path /webhooks/paytabs
```

No account required. The CLI creates a guest account on first run and provides a local tunnel plus a web UI for inspecting requests. Use port `8000` for FastAPI.

## Reference Materials

- [references/overview.md](references/overview.md) - What PayTabs callbacks and IPNs are, transaction fields, payload structure
- [references/setup.md](references/setup.md) - ServerKey, callback and IPN URLs, Hookdeck setup
- [references/verification.md](references/verification.md) - Signature details, published test vector and gotchas

## Recommended: webhook-handler-patterns

We recommend installing [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) alongside this skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [paymob-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paymob-webhooks) - MENA payment gateway webhooks
- [paystack-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paystack-webhooks) - Payments with hex HMAC over the raw body
- [razorpay-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/razorpay-webhooks) - Payments with hex HMAC-SHA256 over the raw body
- [mollie-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mollie-webhooks) - Payment status notifications
- [adyen-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/adyen-webhooks) - Payment notifications with HMAC signatures
- [checkout-com-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/checkout-com-webhooks) - Payment events with HMAC-SHA256
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - HMAC-SHA256 with timestamp
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - HMAC-SHA256 over the raw body with a `sha256=` prefix
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
