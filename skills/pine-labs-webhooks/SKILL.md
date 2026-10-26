---
name: pine-labs-webhooks
description: >
  Receive and verify Pine Labs Online (Plural by Pine Labs) webhooks. Use when
  setting up Pine Labs webhook handlers, debugging Standard Webhooks signature
  verification (webhook-id, webhook-timestamp, webhook-signature, secret key
  used as raw UTF-8 bytes), or handling events like ORDER_PROCESSED,
  PAYMENT_FAILED, REFUND_PROCESSED, SUBSCRIPTION_CHARGED, TOKEN_ACTIVATED and
  payout-transaction-success.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Pine Labs Webhooks

[Pine Labs Online](https://www.pinelabs.com/docs/online-payments) (Plural by Pine Labs) is an Indian payment gateway. It sends webhooks for orders, payments, refunds, card tokens, subscriptions, customers, payouts and cross-border settlement.

## When to Use This Skill

- How do I receive Pine Labs webhooks?
- How do I verify a Pine Labs webhook signature (`webhook-signature`)?
- Why does Pine Labs signature verification fail with the `standardwebhooks` or `svix` library?
- How do I handle `ORDER_PROCESSED`, `PAYMENT_FAILED` or `REFUND_PROCESSED` events?
- How do I handle `SUBSCRIPTION_CHARGED` or `payout-transaction-success`?
- Why am I processing the same Pine Labs event twice, or getting events out of order?

## Verification (core)

Pine Labs uses the [Standard Webhooks](https://www.standardwebhooks.com) headers. Verification is mandatory per Pine Labs' docs.

| Header | Value |
|--------|-------|
| `webhook-id` | Event ID. Same when the webhook is resent |
| `webhook-timestamp` | Unix seconds when the event was triggered |
| `webhook-signature` | Space-delimited list of `v1,<base64>` signatures |

Signed content is `{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64. **The key is the secret key from the Pine Labs dashboard as raw UTF-8 bytes.** There is no `whsec_` prefix and nothing to base64-decode. Pine Labs' docs say to base64-encode the key and decode it again before use, which cancels out.

> **Hookdeck's configuration alert reads exactly:** "Paste the secret key exactly as shown in the Pine Labs dashboard, without adding a whsec_ prefix." Put the secret in `PINE_LABS_WEBHOOK_SECRET` the same way.

```javascript
import crypto from 'node:crypto';

// rawBody: the exact bytes received (express.raw() / request.text()), NOT re-serialised JSON.
// toleranceSec = 0 (default) skips the timestamp window, because Hookdeck retries and replays
// keep the original webhook-timestamp. A positive value opts in.
function verifyPineLabsWebhook(rawBody, { id, timestamp, signature }, secret, toleranceSec = 0) {
  if (!id || !signature || !/^[1-9][0-9]*$/.test(timestamp ?? '')) throw new Error('Missing or malformed headers');
  if (toleranceSec > 0 && Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) {
    throw new Error('Timestamp outside tolerance');
  }
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64') // only if the secret itself starts with whsec_
    : Buffer.from(secret, 'utf8');           // Pine Labs: the secret as-is
  if (key.length === 0) throw new Error('Empty signing key');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();
  const ok = signature.split(' ').some((entry) => {
    const [version, sig] = entry.split(',');
    const given = Buffer.from(sig ?? '', 'base64');
    return version === 'v1' && given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
  if (!ok) throw new Error('Invalid signature');
  return JSON.parse(rawBody.toString('utf8'));
}
```

**Header fallback:** read the `webhook-*` headers and, when `webhook-id` is absent, use the `svix-id`, `svix-timestamp` and `svix-signature` headers instead, as Hookdeck does. The examples do this and test it.

**Why not the `standardwebhooks` or `svix` libraries?** They base64-decode the secret, so they compute the wrong key for Pine Labs' raw string secret. They also enforce a 5-minute timestamp window, which rejects Hookdeck retries and replays (they keep the original timestamp). The examples verify by hand and make the window opt-in with `PINE_LABS_WEBHOOK_TOLERANCE_SECONDS` (default `0`).

The Python version is in [references/verification.md](references/verification.md).

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Payload Shape, Retries and Ordering

Order, payment, refund, customer, token and subscription events are `{ "event_type": "...", "data": { ... } }`. **Payout events (and the Pay by Points order examples) use camelCase `eventType`** with camelCase `data` fields, so read `event_type ?? eventType`.

```json
{ "event_type": "ORDER_PROCESSED",
  "data": { "order_id": "v1-240909084141-aa-O2oJwd", "status": "PROCESSED",
            "order_amount": { "value": 200, "currency": "INR" } } }
```

- Reply `2XX` within **5 seconds**. Anything else is retried: immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours and twice more at 10 hours. (The webhooks overview page says "up to three times", which conflicts with the retry policy page.)
- **Order is not guaranteed.** `ORDER_PROCESSED` can arrive before `ORDER_AUTHORIZED`. Don't build a state machine on arrival order, and use the Get Order API when in doubt.
- Deduplicate on `webhook-id`, which stays the same when an event is resent.

## Common Event Types

Pine Labs documents 30 event types (the list may not be exhaustive). Names are case-sensitive, and the two payout events are lowercase with hyphens.

| Event | Fired when |
|-------|------------|
| `ORDER_AUTHORIZED` | The order is ready for authorization |
| `ORDER_PROCESSED` | The payment is successfully received |
| `ORDER_CANCELLED` / `ORDER_FAILED` | The order is cancelled / fails |
| `PAYMENT_FAILED` | A payment against an order fails |
| `REFUND_PROCESSED` / `REFUND_FAILED` | A refund succeeds / fails |
| `SUBSCRIPTION_CHARGED` | A successful charge is made on a subscription |
| `SUBSCRIPTION_HALTED` | All retries are exhausted and the subscription moves to Halted |
| `payout-transaction-success` / `payout-transaction-failed` | A payout is processed / fails |

Also: `CUSTOMER_ACTIVATED`, `CUSTOMER_DELETED`, `CUSTOMER_SUSPENDED`, `CUSTOMER_CREATION_FAILED`, `TOKEN_ACTIVATED`, `TOKEN_DEACTIVATED`, `TOKEN_SUSPENDED`, `TOKEN_PROVISION_FAILED`, `SUBSCRIPTION_ACTIVATED`, `SUBSCRIPTION_PENDING`, `SUBSCRIPTION_PAUSED`, `SUBSCRIPTION_RESUMED`, `SUBSCRIPTION_COMPLETED`, `SUBSCRIPTION_CANCELLED`, `SUBSCRIPTION_REVOKE_FAILED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_UPDATE_FAILED`, and for cross-border import payments `ORDER_SETTLED` and `ORDER_SETTLEMENT_REJECTED`. See [references/overview.md](references/overview.md).

## Environment Variables

```bash
PINE_LABS_WEBHOOK_SECRET=your_pine_labs_secret_key   # Settings in the Pine Labs dashboard, pasted as-is (no whsec_ prefix)
PINE_LABS_WEBHOOK_TOLERANCE_SECONDS=0                # Optional replay window; a positive value opts in
```

Handlers fail closed: if `PINE_LABS_WEBHOOK_SECRET` is unset they answer `500` rather than accept unverified deliveries.

## Local Development

```bash
npx hookdeck-cli listen 3000 pine-labs --path /webhooks/pine-labs
```

No account required. The CLI creates a guest account on first run and gives you a tunnel and a web UI for inspecting requests. Use port `8000` for the FastAPI example. Pine Labs configures the webhook URL for you during onboarding (see [references/setup.md](references/setup.md)).

## Reference Materials

- [references/overview.md](references/overview.md) - What Pine Labs webhooks are, all 30 events and payload shapes
- [references/setup.md](references/setup.md) - Get the secret key and have Pine Labs register your URL
- [references/verification.md](references/verification.md) - Signature details, Python version, gotchas

## Recommended: webhook-handler-patterns

Install the patterns skill alongside this one for production-ready handlers:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [razorpay-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/razorpay-webhooks) - Indian payment gateway webhooks
- [paystack-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paystack-webhooks) - African payment gateway webhooks
- [xendit-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/xendit-webhooks) - Southeast Asian payment webhooks
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Payments, subscriptions and refunds
- [adyen-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/adyen-webhooks) - Payment notifications
- [mollie-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mollie-webhooks) - Payment status webhooks
- [polar-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/polar-webhooks) - Billing webhooks (Standard Webhooks)
- [svix-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/svix-webhooks) - Generic Svix signature verification
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
