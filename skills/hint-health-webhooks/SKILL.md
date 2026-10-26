---
name: hint-health-webhooks
description: >
  Receive and verify Hint Health webhooks. Use when setting up Hint Health
  (direct primary care practice management) webhook handlers, debugging
  X-Hint-Signature HMAC-SHA256 verification, or handling events like
  patient.created, patient.updated, membership.created, membership.updated,
  and practitioner.created.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Hint Health Webhooks

## When to Use This Skill

- How do I receive Hint Health webhooks?
- How do I verify the `X-Hint-Signature` header on a Hint Health webhook?
- Why is my Hint Health webhook signature verification failing?
- Which key signs Hint Health webhooks (the "webhooks signature key")?
- How do I handle `patient.created`, `membership.updated`, or `practitioner.created` events?
- How do I run Hint Health webhooks through Hookdeck?

## Verification (core)

Every delivery carries `X-Hint-Signature: sha256=<digest>`. The digest is the lowercase **hex** HMAC-SHA256 of the **raw request body bytes**, keyed with your webhooks signature key (its UTF-8 bytes, used as-is). No timestamp, id or other header is signed, and there is no official verification SDK, so verification is manual. Accept the header with or without the `sha256=` prefix.

Node:

```javascript
const crypto = require('crypto');

function verifyHintSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !secret) return false;
  const digest = header.startsWith('sha256=') ? header.slice(7) : header;
  // Buffer.from(x, 'hex') silently drops bad characters: check the format first
  if (!/^[0-9a-f]{64}$/i.test(digest)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), expected);
}
```

Python:

```python
import hashlib, hmac, re

def verify_hint_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    if not header or not secret:
        return False
    digest = header.removeprefix("sha256=")
    if not re.fullmatch(r"[0-9a-f]{64}", digest, re.IGNORECASE | re.ASCII):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest.lower().encode("ascii"), expected.encode("ascii"))
```

> In Express, read the raw body with `express.raw({ type: '*/*' })` so any content type verifies. Parse the JSON only after the check passes.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

Respond `401` for a missing, empty or malformed header and for a mismatch.

## Common Event Types

The event name is the top-level `type` field of the JSON body (`resource.action`); it is not sent in a header. The envelope is `id`, `created_at`, `type`, `practice_id`, `object`, where `object` is the affected record.

| Event | Description |
|-------|-------------|
| `patient.created` / `patient.updated` | A patient is created or changes |
| `patient.destroyed` / `patient.inactive` | A patient is deleted or becomes inactive |
| `membership.created` / `membership.updated` / `membership.destroyed` | A membership is created, changes or is deleted |
| `practitioner.created` / `practitioner.updated` / `practitioner.destroyed` | A practitioner is created, changes or is deleted |

Hint documents 44 event types in all (also `company.*`, `employee_division.created` and more). See [references/overview.md](references/overview.md).

## Environment Variables

```bash
HINT_HEALTH_WEBHOOK_SECRET=your_webhooks_signature_key
```

## Setup (Hint Health and Hookdeck)

The signing secret is the **webhooks signature key**, which is one of your partner API keys (by default the one created with your partner account). Partners find it under Partner Portal > Webhooks > Settings; a practice with API Access finds its own under Admin > Developers > Webhook Endpoints. Live and sandbox have separate keys, and rotation takes effect immediately with no overlap.

For the Hookdeck source: Paste the partner API key you chose as the webhooks signature key.

Hint delivers at least once, so make handlers idempotent (use the envelope `id`). Respond within 20 seconds (5 second connect timeout). Failed deliveries are retried hourly, up to 72 attempts, and an integration with over 100 failed attempts is muted. See [references/setup.md](references/setup.md).

## Local Development

```bash
npx hookdeck-cli listen 3000 hint-health --path /webhooks/hint-health
```

No account required. The CLI creates a guest account on first run and provides a local tunnel plus a web UI for inspecting requests. Use port `8000` for FastAPI.

## Reference Materials

- [references/overview.md](references/overview.md) - What Hint Health webhooks are, event types, payload structure, delivery behavior
- [references/setup.md](references/setup.md) - Signature key, endpoint registration, Hookdeck setup
- [references/verification.md](references/verification.md) - Signature details and gotchas

## Recommended: webhook-handler-patterns

We recommend installing [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) alongside this skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [athenahealth-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/athenahealth-webhooks) - Healthcare platform webhooks
- [zenefits-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/zenefits-webhooks) - HR events with hex HMAC-SHA256 over the raw body
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - HMAC-SHA256 over the raw body with a `sha256=` prefix
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - HMAC-SHA256 with a Base64 header
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - HMAC-SHA256 with timestamp
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
