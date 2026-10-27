---
name: usesend-webhooks
description: >
  Receive and verify useSend webhooks (usesend.com, the open-source email
  platform formerly called Unsend). Use when setting up a useSend webhook
  handler, debugging X-UseSend-Signature verification, or handling email events
  like email.delivered, email.bounced, email.complained, email.opened and
  email.clicked, plus contact.created and domain.verified. Not Standard
  Webhooks: the secret is a plain UTF-8 HMAC key and the digest is hex.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# useSend Webhooks

useSend (usesend.com) is an open-source email sending platform. It sends a
webhook when an email is queued, sent, delivered, bounced or opened, when a
contact changes, and when a domain changes.

## When to Use This Skill

- How do I receive useSend webhooks?
- How do I verify the `X-UseSend-Signature` header?
- Why is my useSend signature verification failing?
- How do I handle `email.delivered`, `email.bounced` or `email.clicked` events?
- How do I set up a webhook in the useSend dashboard?

## How Verification Works

- Headers: `X-UseSend-Signature` (`v1=<hex>`) and `X-UseSend-Timestamp` (Unix
  **milliseconds**).
- Signature: lowercase hex HMAC-SHA256, keyed with the secret, over
  `{X-UseSend-Timestamp}` + `.` + the **raw request body bytes**.
- The secret is used **whole, as a plain UTF-8 key, including its `whsec_`
  prefix**. Nothing is base64-decoded.
- **This is not Standard Webhooks.** There is no `webhook-id` header and the
  digest is hex, so do not use the `standardwebhooks` or `svix` libraries.
- A missing or empty header, a malformed value or a mismatch is a `401`.

> **Setup note:** Paste the whole secret, including the whsec_ prefix. useSend uses it as a plain HMAC key.

## Verification (core)

```javascript
const crypto = require('crypto');

// rawBody: Buffer of the exact bytes received (never parsed JSON).
function verifyUseSend(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;
  const hex = (signature.startsWith('v1=') ? signature.slice(3) : signature).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return false; // validate before decoding
  const message = Buffer.concat([
    Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody,
  ]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(hex, 'hex'));
}
```

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

The examples verify by hand rather than with the `usesend-js` SDK, because the
SDK rejects timestamps older than 5 minutes by default and Hookdeck retries and
replays resend the original timestamp. See
[references/verification.md](references/verification.md).

### Timestamp tolerance is opt-in

The examples do **not** reject old timestamps by default. Hookdeck retries and
replays resend the original headers, and Hookdeck itself applies no tolerance,
so a fixed window would reject legitimate retries. To turn one on, set
`USESEND_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off). Remember the header is
in milliseconds. Deduplicate on the payload `id` either way.

## Common Event Types

Dispatch on the body's `type` field.

| Event | Triggered When |
|-------|----------------|
| `email.delivered` | Email was successfully delivered |
| `email.bounced` | Email bounced (permanent or temporary); `data.bounce` has details |
| `email.complained` | Recipient marked the email as spam |
| `email.opened` / `email.clicked` | Recipient opened the email / clicked a link |
| `contact.created` | New contact was created |
| `domain.verified` | Domain verification completed |
| `webhook.test` | Sent by "Send Test" in the dashboard |

useSend documents 20 event types plus the `webhook.test` event (21 in all):
13 `email.*`, 3 `contact.*` and 4 `domain.*`. The examples handle a few and log
the rest. See [references/overview.md](references/overview.md).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `USESEND_WEBHOOK_SECRET` | The webhook signing secret, whole, including `whsec_` |
| `USESEND_WEBHOOK_TOLERANCE_SECONDS` | Optional replay window in seconds (unset or `0` = off) |

## Delivery Behaviour

POST with a JSON body. A `2xx` within 10 seconds acknowledges it. Otherwise
useSend makes 6 attempts in all (immediately, then after about 5, 10, 20, 40 and
80 seconds). A webhook is disabled after 30 consecutive failed calls and is
re-enabled from the dashboard. Duplicates are possible.

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 usesend --path /webhooks/usesend
```

No account required — the CLI creates a guest account on first run and provides a
local tunnel + web UI for inspecting requests.

## Reference Materials

- [references/overview.md](references/overview.md) — What useSend webhooks are, events, payload structure
- [references/setup.md](references/setup.md) — Create the webhook, get the signing secret
- [references/verification.md](references/verification.md) — Signature details and gotchas
- [examples/express/](examples/express/) — Express (Node.js) handler + tests
- [examples/nextjs/](examples/nextjs/) — Next.js App Router handler + tests
- [examples/fastapi/](examples/fastapi/) — FastAPI (Python) handler + tests

## Recommended: webhook-handler-patterns

Install [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns)
alongside this skill for cross-cutting concerns. useSend can deliver duplicates:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [resend-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/resend-webhooks) - Resend email events (Svix-signed)
- [postmark-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/postmark-webhooks) - Postmark delivery, bounce and open webhooks
- [sendgrid-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sendgrid-webhooks) - SendGrid event webhooks
- [mailgun-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mailgun-webhooks) - Mailgun email event webhooks
- [sparkpost-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sparkpost-webhooks) - SparkPost email event webhooks
- [brevo-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/brevo-webhooks) - Brevo transactional and marketing email events
- [mailjet-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mailjet-webhooks) - Mailjet event webhooks
- [customerio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/customerio-webhooks) - Customer.io messaging events
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
