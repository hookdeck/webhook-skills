---
name: paysafe-webhooks
description: >
  Receive and verify Paysafe Payments API webhooks. Use when setting up Paysafe
  webhook handlers, debugging Signature header verification, or handling events
  like PAYMENT_HANDLE_COMPLETED, PAYMENT_COMPLETED, and SETTLEMENT_COMPLETED.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Paysafe Webhooks

## When to Use This Skill

- How do I receive Paysafe webhooks?
- How do I verify the Paysafe `Signature` header?
- Why is my Paysafe webhook signature verification failing?
- How do I handle `PAYMENT_HANDLE_COMPLETED` or `SETTLEMENT_COMPLETED` events?
- Handling redirect-flow payment methods (Skrill, Paysafecard, PayPal, Interac) that finish asynchronously

## Verification (core)

Paysafe sends a `Signature` header containing the base64 HMAC-SHA256 of the **raw JSON request body**, keyed with the HMAC key from the Business Portal. Use the key as a **raw UTF-8 string** (do not base64-decode it). There is no timestamp in the signed content.

```javascript
const crypto = require('crypto');

function verifyPaysafeWebhook(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}
```

```python
import base64, hashlib, hmac

def verify_paysafe_webhook(raw_body: bytes, signature_header: str | None, secret: str) -> bool:
    if not raw_body or not signature_header:
        return False
    expected = base64.b64encode(hmac.new(secret.encode(), raw_body, hashlib.sha256).digest()).decode()
    return hmac.compare_digest(signature_header.encode(), expected.encode())
```

> **Raw body only.** Verify the exact bytes received before parsing. In Express use `express.raw({ type: '*/*' })` so any content type verifies.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

Payload fields: `payload`, `attemptNumber`, `type`, `resourceId`, `links`, `eventDate`, `eventName`.

| `eventName` | Description |
|-------------|-------------|
| `PAYMENT_HANDLE_INITIATED` | Payment handle request received, awaiting downstream processor |
| `PAYMENT_HANDLE_PAYABLE` | Handle is `PAYABLE` and can be used for a payment call |
| `PAYMENT_HANDLE_COMPLETED` | Payment associated with the handle was initiated |
| `PAYMENT_HANDLE_FAILED` | Handle request failed or was declined |
| `PAYMENT_COMPLETED` | Payment request completed |
| `PAYMENT_FAILED` | Payment failed or was declined |
| `PAYMENT_CANCELLED` | Payment fully voided (reversed) |
| `PAYMENT_HELD` | Payment placed on hold for risk review |
| `SETTLEMENT_COMPLETED` | Settlement request completed |
| `SETTLEMENT_FAILED` | Settlement failed or was declined |

Other categories include void authorization (`VOIDAUTH_*`), registration, refunds, original/standalone credits, and payment scheduler. See [Paysafe webhook events](https://developer.paysafe.com/en/api-docs/paysafe-checkout/webhook-events/).

## Notes

- Payloads are minimal; use `links` / `resourceId` to fetch the full resource from the Paysafe API.
- Paysafe's doc example shows the resource body rather than the `eventName` envelope, so handle both and dispatch on `eventName` when present (see [references/overview.md](references/overview.md)).
- Return 2xx to acknowledge. On a 4xx or 5xx response Paysafe retries up to three times.
- Webhooks are configured in the Business Portal; Paysafe strongly recommends them for redirect-flow payment methods.

## Environment Variables

```bash
PAYSAFE_WEBHOOK_SECRET=your_paysafe_hmac_key_here   # HMAC key from the Business Portal
```

## Local Development

```bash
npx hookdeck-cli listen 3000 paysafe --path /webhooks/paysafe
```

No account required. Use port 8000 for FastAPI.

## Reference Materials

- [references/overview.md](references/overview.md) - Paysafe webhook concepts and events
- [references/setup.md](references/setup.md) - Business Portal configuration
- [references/verification.md](references/verification.md) - Signature verification details and gotchas

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Prevent duplicate processing
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [adyen-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/adyen-webhooks) - Adyen payment webhook handling
- [checkout-com-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/checkout-com-webhooks) - Checkout.com payment webhook handling
- [mollie-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mollie-webhooks) - Mollie payment webhook handling
- [square-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/square-webhooks) - Square payment webhook handling
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhook handling
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - Shopify base64 HMAC-SHA256 webhooks
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure with guaranteed delivery, retries, replay, and observability
