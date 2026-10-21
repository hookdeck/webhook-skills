---
name: whop-webhooks
description: >
  Receive and verify Whop webhooks. Use when setting up Whop webhook handlers,
  debugging Standard Webhooks signature verification (webhook-id, webhook-timestamp,
  webhook-signature), or handling payment.succeeded, payment.failed,
  membership.activated, membership.deactivated, and refund.created events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Whop Webhooks

## When to Use This Skill

- How do I receive Whop webhooks?
- How do I verify Whop webhook signatures (Standard Webhooks, `ws_` secret)?
- How do I handle `payment.succeeded` or `membership.activated` events to grant access?
- Why is my Whop webhook signature verification failing?
- How do I handle `membership.deactivated` and `refund.created` events?

## Verification (core)

Whop uses [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks): headers `webhook-id`, `webhook-timestamp`, `webhook-signature` (`v1,<base64>`), HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`. The `ws_...` signing secret is the **literal UTF-8 HMAC key**: do not strip `ws_` and do not base64-decode it.

```javascript
// Manual verification (what the examples do).
// toleranceSec = 0 (default) skips the timestamp window, because Hookdeck retries and replays
// keep the original webhook-timestamp. A positive value opts in.
const crypto = require('crypto');
function verifyWhop(rawBody, headers, secret, toleranceSec = 0) {
  const { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sigHeader } = headers;
  if (!id || !/^\d+$/.test(ts ?? '') || !sigHeader) return false;
  if (toleranceSec > 0 && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${id}.${ts}.${rawBody}`).digest('base64');
  return sigHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) return false;
    const a = Buffer.from(sig), b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}
```

**Why not the SDK helper?** `unwrapWebhook()` (`@whop/sdk/helpers`) and `unwrap()` (`whop_sdk`) check the same signature, but they always enforce a 5-minute timestamp window with no way to turn it off. Hookdeck retries and replays carry the original `webhook-timestamp`, so the SDK rejects them. The examples verify manually and make the window opt-in with `WHOP_TIMESTAMP_TOLERANCE_SECONDS` (default `0`; a positive number of seconds turns it on; anything that isn't a whole number is treated as `0`, with a warning at startup). If you never retry or replay late, the SDK is fine.

SDK usage, if the fixed window is acceptable: `unwrapWebhook(rawBodyString, { headers, key: secret })` from `@whop/sdk/helpers`, or `from whop_sdk.lib.verify_webhook import unwrap` then `unwrap(raw_body, headers=dict(request.headers), key=secret)`. If you use the generic `standardwebhooks` library directly, pass `base64(utf8(secret))` as the key, because it base64-decodes its input (the Whop SDKs do this for you).

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

| Event | Triggered When |
|-------|----------------|
| `payment.succeeded` | A payment completes (fulfill the order) |
| `payment.failed` | A payment fails; check `data.decline_code`, `data.failure_message`, `data.recovery_url` |
| `membership.activated` | A membership becomes active (grant access) |
| `membership.deactivated` | A membership ends (revoke access) |
| `refund.created` | A refund is issued |

Event names use `resource.action`. See [references/overview.md](references/overview.md) for more events (`payment.requires_action`, `membership.updated`, `dispute.created`, ...).

## Gotchas

- Use the **raw body**; parsing JSON first changes the bytes and breaks the signature.
- Pass the secret exactly as Whop issued it (`ws_...`). Stripping the prefix or base64-decoding it fails verification.
- The SDK helper rejects timestamps more than 5 minutes off, which also rejects Hookdeck retries and replays (they keep the original timestamp). The examples only check the window when `WHOP_TIMESTAMP_TOLERANCE_SECONDS` is set. Retries reuse the same `webhook-id`, so deduplicate on it.
- Respond `2xx` within 5 seconds; redirects count as failures. Endpoints that keep failing are disabled after 72 hours.
- Legacy `v2`/`v5` webhook formats are not Standard Webhooks signed; use `api_version: v1`.

## Environment Variables

```bash
# Developer tab -> Secret column (or `webhook_secret` from POST /api/v1/webhooks, shown once)
WHOP_WEBHOOK_SECRET=ws_your_signing_secret_here
WHOP_TIMESTAMP_TOLERANCE_SECONDS=0   # Optional replay window; a positive value opts in
```

## Local Development

```bash
npx hookdeck-cli listen 3000 whop --path /webhooks/whop
```

No account required. Register the printed URL as the webhook endpoint in Whop (it rejects localhost URLs).

## Reference Materials

- [references/overview.md](references/overview.md) - What Whop webhooks are, events, payload structure
- [references/setup.md](references/setup.md) - Create a webhook and get the signing secret
- [references/verification.md](references/verification.md) - Signature details, manual verification, debugging

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) - Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) - Deduplicate on `webhook-id`
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) - Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) - Provider retry schedules, backoff patterns

## Related Skills

- [vanta-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/vanta-webhooks) - Svix-style signatures (same HMAC-SHA256 base64 scheme)
- [svix-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/svix-webhooks) - Generic Svix webhook verification
- [clerk-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/clerk-webhooks) - Clerk auth webhooks (Standard Webhooks style)
- [openai-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/openai-webhooks) - OpenAI webhooks (Standard Webhooks)
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhook handling
- [paddle-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paddle-webhooks) - Paddle billing webhooks
- [polar-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/polar-webhooks) - Polar digital products and subscriptions
- [fastspring-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/fastspring-webhooks) - FastSpring digital commerce webhooks
- [recurly-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/recurly-webhooks) - Recurly subscription webhooks
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue - guaranteed delivery, automatic retries, replay, rate limiting, and observability
