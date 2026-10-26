---
name: learnhouse-webhooks
description: >
  Receive and verify LearnHouse webhooks. Use when setting up LearnHouse webhook
  handlers, debugging X-Webhook-Signature verification, or handling events such as
  course_completed, course_enrolled, assignment_submitted and user_signed_up.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# LearnHouse Webhooks

## When to Use This Skill

- How do I receive LearnHouse webhooks?
- How do I verify the LearnHouse `X-Webhook-Signature` header?
- How do I handle `course_completed`, `course_enrolled` or `assignment_graded` events?
- Why is my LearnHouse webhook signature verification failing?
- How do I deduplicate LearnHouse deliveries on `delivery_id`?

## How LearnHouse Signs Webhooks

LearnHouse (open-source learning platform, cloud or self-hosted) POSTs a JSON envelope to your endpoint. Webhooks are a Pro feature.

- Header: `X-Webhook-Signature: sha256=<hex>`
- Algorithm: HMAC-SHA256, lowercase hex
- Signed content: the **raw request body bytes only**. No timestamp, id or other header is signed, so there is no replay window to check.
- Key: the endpoint secret (`whsec_...`), used **whole, prefix included, as plain UTF-8 bytes**. This is **not** Standard Webhooks: do not strip `whsec_`, do not base64-decode it, and do not use the `standardwebhooks` or `svix` libraries.
- Missing, malformed or mismatched signature: respond `401`.

## Verification (core)

```javascript
const crypto = require('crypto');

function verifyLearnhouseSignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const value = header.startsWith('sha256=') ? header.slice(7) : header; // bare digest also accepted
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return false; // validate before decoding
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

```python
import hmac, hashlib, re

def verify_learnhouse_signature(raw_body: bytes, header: str | None, secret: str | None) -> bool:
    if not header or not secret:
        return False
    value = header[len("sha256="):] if header.startswith("sha256=") else header
    if not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)
```

`raw_body` / `rawBody` must be the exact bytes received: never decode and re-encode, and never `JSON.parse`/`JSON.stringify` before verifying. Hex is compared case-insensitively.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Handling Events

Dispatch on the body's `event` field (the same name is also sent in the `X-Webhook-Event` header). Treat every field of the parsed body as untrusted and check its type before reading into it. Deliveries are at-least-once: dedupe on `delivery_id` (also sent as `X-Webhook-Delivery`).

```json
{
  "event": "course_completed",
  "delivery_id": "dlv_1a2b3c4d5e6f7081",
  "timestamp": "2026-06-22T12:00:00Z",
  "org_id": 1,
  "data": {
    "user": { "user_uuid": "user_…", "email": "learner@example.com", "username": "learner" },
    "course": { "course_uuid": "course_…", "name": "Introduction to Python" }
  }
}
```

## Common Event Types

LearnHouse documents 39 event types; the full list is in [references/overview.md](references/overview.md).

| Event | Triggered When |
|-------|----------------|
| `ping` | You send a test from the dashboard or `POST .../test` |
| `course_enrolled` | A learner enrolls in a course |
| `course_completed` | A learner completes a course |
| `activity_completed` | A learner completes an activity |
| `assignment_submitted` | A learner submits an assignment |
| `assignment_graded` | An assignment is graded |
| `certificate_claimed` | A learner claims a certificate |
| `user_signed_up` | A user signs up to the organization |

## Environment Variables

```bash
LEARNHOUSE_WEBHOOK_SECRET=whsec_your_endpoint_secret
```

Paste the whole secret, including the whsec_ prefix. LearnHouse uses it as a plain HMAC key.

## Local Development

LearnHouse rejects `localhost` and private IPs, so a local receiver needs a public tunnel. Run the Hookdeck CLI via `npx` (no install, no account required):

```bash
npx hookdeck-cli listen 3000 learnhouse --path /webhooks/learnhouse
```

Use the tunnel URL as the endpoint URL in LearnHouse. If you route deliveries through Hookdeck, its `LearnHouse` source verifies the signature (set the source secret to the full `whsec_...` value).

## Reference Materials

- [references/overview.md](references/overview.md) - What LearnHouse webhooks are, all 39 events, payload and headers
- [references/setup.md](references/setup.md) - Create an endpoint and get the signing secret
- [references/verification.md](references/verification.md) - Signature verification details and gotchas
- [examples/](examples/) - Runnable Express, Next.js and FastAPI receivers

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler concerns (idempotency, error handling, retries). Key references:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [absorb-lms-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/absorb-lms-webhooks) - Another learning management system
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub webhooks (`sha256=` HMAC of the raw body)
- [cursor-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/cursor-webhooks) - `X-Webhook-Signature` with `sha256=` HMAC
- [toggl-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/toggl-webhooks) - `sha256=` HMAC of the raw body
- [circle-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/circle-webhooks) - Community platform webhooks
- [zoom-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/zoom-webhooks) - Zoom webhooks
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe webhooks (payments)
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure with retries, replay and observability
