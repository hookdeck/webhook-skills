---
name: zenefits-webhooks
description: >
  Receive and verify TriNet Zenefits webhooks. Use when setting up Zenefits
  partner-app webhook handlers, debugging the `signature` header HMAC-SHA256
  verification, or handling events like people.did_create, people.did_change,
  employments.did_start, employments.did_terminate, and flow.did_complete.hiring.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# TriNet Zenefits Webhooks

## When to Use This Skill

- How do I receive TriNet Zenefits webhooks?
- How do I verify the `signature` header on a Zenefits webhook?
- Why is my Zenefits webhook signature verification failing?
- Which secret signs Zenefits webhooks: the OAuth client secret or the webhook shared secret?
- How do I handle `people.did_create`, `employments.did_start`, `employments.did_terminate`, or `flow.did_complete.hiring` events?
- How do I run Zenefits webhooks through Hookdeck?

## Verification (core)

Zenefits sends a header literally named `signature` containing the **hex** HMAC-SHA256 of the **raw request body**, keyed with your application's **webhook shared secret** (used as a raw string). This is **not** the OAuth client secret. There is no timestamp and no official SDK, so verification is manual.

Node:

```javascript
const crypto = require('crypto');

function verifyZenefitsSignature(rawBody, signatureHeader, secret) {
  if (typeof signatureHeader !== 'string' || !secret) return false;
  // Buffer.from(x, 'hex') silently truncates invalid hex: check the format first
  if (!/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(signatureHeader, 'hex'), expected);
}
```

Python:

```python
import hashlib, hmac

def verify_zenefits_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes so a non-ASCII header returns False instead of raising
    return hmac.compare_digest(signature_header.lower().encode(), expected.encode())
```

Example from the Zenefits docs (used in the tests): secret `lDVtBQnoRcqYv4fUeVD0oyzgsKWHGtqhatjBX5wXRFQzkVUCzBA571E4qUxvR5LE` and body `{"test":"valid payload"}` give signature `219a08ea32f319931dc849badc076323f40367aad859ddba4de82e33135fad31`.

> In Express, read the raw body with `express.raw({ type: '*/*' })` so any content type verifies.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

The event name is the `type` field in the JSON body (`<object>.<action>[.<subtype>]`); it is not sent in a header. `data` matches the REST API shape for that object.

| Event | Description |
|-------|-------------|
| `companies.did_create` / `companies.did_change` | A company object is created or changes |
| `people.did_create` | A new person is created |
| `people.did_change` | A person object changes |
| `employments.did_start` | A person's first day of work (fires on `hire_date`) |
| `employments.did_terminate` | A person's last day of work (fires on `termination_date`) |
| `flow.did_complete.hiring` | An admin completes a hiring flow for a person |

Many more exist (`departments.*`, `locations.*`, `vacation_requests.*`, `time_durations.*`, `custom_field_values.*`, and others). See [references/overview.md](references/overview.md).

## Environment Variables

```bash
ZENEFITS_WEBHOOK_SECRET=your_webhook_shared_secret
```

## Setup (Zenefits and Hookdeck)

Use your app's **webhook shared secret**, not its **OAuth client secret**. Zenefits generates the shared secret for your application and signs every webhook with it. If you receive webhooks through Hookdeck, paste the same webhook shared secret into the Zenefits source's verification settings. Webhook URLs must be HTTPS and return a `2xx` quickly; Zenefits retries failures for up to 1 hour and may deliver a message more than once. See [references/setup.md](references/setup.md).

## Local Development

```bash
npx hookdeck-cli listen 3000 zenefits --path /webhooks/zenefits
```

No account required. The CLI creates a guest account on first run and provides a local tunnel plus a web UI for inspecting requests. Use port `8000` for FastAPI.

## Reference Materials

- [references/overview.md](references/overview.md) - What Zenefits webhooks are, event types, payload structure, retries
- [references/setup.md](references/setup.md) - Secret, endpoint requirements, Hookdeck setup
- [references/verification.md](references/verification.md) - Signature details and gotchas

## Recommended: webhook-handler-patterns

We recommend installing [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) alongside this skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [hibob-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hibob-webhooks) - HiBob HR events with HMAC verification
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - Simple HMAC-SHA256 over the raw body
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - HMAC-SHA256 with a Base64 header
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - HMAC-SHA256 with timestamp
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
