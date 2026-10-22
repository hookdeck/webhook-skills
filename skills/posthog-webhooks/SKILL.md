---
name: posthog-webhooks
description: >
  Receive and verify PostHog webhooks from the Webhook destination (CDP). Use when
  setting up PostHog webhook handlers, debugging Standard Webhooks signature
  verification (webhook-id, webhook-timestamp, webhook-signature), choosing a
  signing secret, or handling events like $pageview, $identify, or custom events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# PostHog Webhooks

## When to Use This Skill

- How do I receive PostHog webhooks?
- How do I verify PostHog webhook signatures?
- What secret do I put in the PostHog Webhook destination "Signing secret" input?
- How do I handle `$pageview`, `$identify`, or custom events from PostHog?
- Why does PostHog signature verification fail behind Hookdeck or after a retry?

## How PostHog Signs Webhooks

The CDP **Webhook destination** has an optional **Signing secret**. When set, each request follows [Standard Webhooks](https://www.standardwebhooks.com):

| Header | Value |
|--------|-------|
| `webhook-id` | Unique message ID (constant across retries of one message) |
| `webhook-timestamp` | Unix seconds when that attempt was signed |
| `webhook-signature` | `v1,<base64>` |

Signature: HMAC-SHA256 over `<webhook-id>.<webhook-timestamp>.<raw body>`, base64 encoded. Signing is documented only in PostHog's open-source code ([`standard-webhooks.ts`](https://github.com/PostHog/posthog/blob/master/nodejs/src/cdp/utils/standard-webhooks.ts)), not on the docs page. No signing secret means no signature headers.

### You choose the secret

PostHog does not issue one. It strips an optional `whsec_` prefix, base64-decodes the rest, and requires at least 24 decoded bytes. **Generate a `whsec_<base64>` secret and paste the same string into PostHog and your receiver (or Hookdeck):**

```bash
echo "whsec_$(openssl rand -base64 32)"
```

A bare base64 secret works in PostHog but fails Hookdeck, so always keep the `whsec_` prefix.

## Verification (core)

```javascript
const { Webhook } = require('standardwebhooks');

// rawBody MUST be the unparsed body (Express: express.raw({ type: '*/*' }))
const payload = new Webhook(process.env.POSTHOG_WEBHOOK_SECRET).verify(rawBody, {
  'webhook-id': req.headers['webhook-id'],
  'webhook-timestamp': req.headers['webhook-timestamp'],
  'webhook-signature': req.headers['webhook-signature'],
}); // throws on a bad signature or a timestamp older than 5 minutes
```

Python: `from standardwebhooks.webhooks import Webhook`, then `Webhook(secret).verify(raw_body, headers)`.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

### Timestamp window and Hookdeck retries

The `standardwebhooks` and `svix` libraries **always enforce a fixed 5-minute timestamp window**. PostHog signs a fresh timestamp on each of its own attempts, but **Hookdeck retries and replays resend the original timestamp**, so the library rejects them once they are more than 5 minutes old. If you receive through Hookdeck and need late retries or replays to pass, use the manual verifier in [references/verification.md](references/verification.md), where the window can be dropped or widened (deduplicate on `webhook-id` instead).

## Event Payload

The body is whatever the destination's template sends. The default is `{ "event": {...}, "person": {...} }`. Dispatch on `event.event`:

| `event.event` | Meaning |
|---------------|---------|
| `$pageview` | Page viewed |
| `$identify` | User identified |
| `$autocapture` | Autocaptured click/input |
| `<custom name>` | Any custom event, e.g. `signed_up` |

See [references/overview.md](references/overview.md).

## Environment Variables

```bash
POSTHOG_WEBHOOK_SECRET=whsec_your_base64_secret_here
```

## Local Development

```bash
npx hookdeck-cli listen 3000 posthog --path /webhooks/posthog
```

No account required. Use the printed Hookdeck URL as the PostHog destination URL. Use port `8000` for FastAPI.

## Reference Materials

- [references/overview.md](references/overview.md) - What PostHog webhooks are, payload and events
- [references/setup.md](references/setup.md) - Create the destination, generate the secret
- [references/verification.md](references/verification.md) - Signature details, manual verifier, gotchas

## Recommended: webhook-handler-patterns

Install [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) alongside this skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [clerk-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/clerk-webhooks) - Standard Webhooks via Svix, user events
- [svix-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/svix-webhooks) - Svix / Standard Webhooks verification
- [segment-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/segment-webhooks) - Customer data and analytics events
- [customerio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/customerio-webhooks) - Messaging and customer events
- [launchdarkly-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/launchdarkly-webhooks) - Feature flag events
- [sentry-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sentry-webhooks) - Error monitoring events
- [resend-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/resend-webhooks) - Standard Webhooks email events
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
