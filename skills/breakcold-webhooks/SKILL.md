---
name: breakcold-webhooks
description: >
  Receive and verify Breakcold webhooks (the sales CRM at breakcold.com). Use when
  setting up a Breakcold outbound webhook handler, debugging X-Webhook-Signature
  verification, or handling record.created, record.updated, note.created,
  task.completed, relation.added, call.linked or file.uploaded events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Breakcold Webhooks

Breakcold (breakcold.com) is a sales CRM. Its outbound webhooks send an HTTPS `POST` with a JSON body whenever records, notes, tasks, relations, calls or files change in a workspace.

## When to Use This Skill

- How do I receive Breakcold webhooks?
- How do I verify the Breakcold `X-Webhook-Signature` header?
- Why does my Breakcold webhook signature verification fail?
- How do I handle `record.created`, `note.created` or `task.completed` events?

## Resources

- `references/overview.md` - events, headers, payload envelope, delivery behaviour
- `references/setup.md` - create the outbound webhook and copy the signing secret
- `references/verification.md` - signature details, gotchas, debugging
- `examples/` - runnable Express, Next.js and FastAPI handlers with tests

## Verification (core)

Breakcold signs `{X-Webhook-Timestamp}.{raw body}` with HMAC-SHA256 (lowercase hex) keyed with the endpoint's signing secret, and sends it as `X-Webhook-Signature: sha256=<hex>`.

```javascript
const crypto = require('crypto');

function verifyBreakcoldSignature(rawBody, signatureHeader, timestampHeader, secret) {
  if (!signatureHeader || !timestampHeader || !secret) return false;
  const digest = signatureHeader.replace(/^sha256=/i, '');   // prefix optional
  if (!/^[0-9a-f]{64}$/i.test(digest)) return false;         // validate before decoding

  const signed = Buffer.concat([
    Buffer.from(timestampHeader, 'latin1'), Buffer.from('.'), rawBody, // rawBody is a Buffer
  ]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), expected);
}
```

- Use the **raw body bytes** (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`). Never `JSON.parse` and re-serialize before verifying.
- The secret is a string used as UTF-8 bytes as-is (no hex or base64 decoding).
- Reject with **401** when the signature or timestamp header is missing, malformed or does not match.
- **No timestamp window by default.** Hookdeck retries and replays resend the original `X-Webhook-Timestamp`, so a fixed window rejects legitimate retries. The examples offer an opt-in `BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS` (Unix seconds; unset or `0` = off).

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

Dispatch on the body's `event` field (also sent as `X-Webhook-Event`).

| Event | Fires when |
|-------|------------|
| `record.created` / `record.updated` / `record.deleted` | A record is created, a field changes, or it is deleted |
| `note.created` / `note.updated` / `note.deleted` | A note is added to, edited on, or removed from a record |
| `task.created` / `task.completed` | A task is linked to a record, or marked complete |
| `relation.added` / `relation.removed` | A relation between records is added or removed |
| `call.linked` / `call.unlinked` | A call recording is linked to or unlinked from a record |
| `file.uploaded` / `file.deleted` | A file is added to or removed from a record |
| `webhook.test` | You press the endpoint's test button |

Use `X-Webhook-Delivery-Id` for idempotency. Any `2xx` accepts a delivery; Breakcold makes up to 3 attempts (retries after about 5 s and 30 s), times out after 10 s, and disables an endpoint after 50 consecutive failures.

## Environment Variables

```bash
BREAKCOLD_WEBHOOK_SECRET=your_breakcold_signing_secret
# Optional. Unset or 0 = no timestamp check.
BREAKCOLD_WEBHOOK_TOLERANCE_SECONDS=300
```

## Local Development

```bash
npx hookdeck-cli listen 3000 breakcold --path /webhooks/breakcold
```

No account required. Use `8000` instead of `3000` for FastAPI.

## Recommended: webhook-handler-patterns

Install [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) alongside this skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [hubspot-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hubspot-webhooks) - HubSpot CRM webhooks
- [pipedrive-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/pipedrive-webhooks) - Pipedrive CRM webhooks
- [salesforce-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/salesforce-webhooks) - Salesforce outbound events
- [attio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/attio-webhooks) - Attio CRM webhooks
- [instantly-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/instantly-webhooks) - Sales outreach webhooks
- [cronofy-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/cronofy-webhooks) - Scheduling webhooks
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
