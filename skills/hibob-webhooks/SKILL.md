---
name: hibob-webhooks
description: >
  Receive and verify HiBob (Bob) webhooks. Use when setting up Hibob webhook
  handlers, debugging Bob-Signature HMAC-SHA512 verification, or handling HR
  events like employee.created, employee.joined, employee.left, or
  timeoff.request.requested.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# HiBob (Bob) Webhooks

## When to Use This Skill

- How do I receive HiBob (Bob) webhooks?
- How do I verify the `Bob-Signature` header on a Hibob webhook?
- Why is my Hibob webhook signature verification failing?
- How do I handle `employee.created`, `employee.updated`, `employee.joined`, or `employee.left` events?
- How do I handle time off events like `timeoff.request.requested` and `timeoff.request.approved`?
- Why does Bob keep sending a "Ping test" request to my endpoint?

## Verification (core)

Bob signs the **raw request body** with **HMAC-SHA512**, keyed with the secret shown in the Bob webhook configuration (used as a raw UTF-8 string, not decoded), and sends the **base64** digest in the `Bob-Signature` header. There is no timestamp header and no official SDK, so verification is manual.

Node:

```javascript
const crypto = require('crypto');

function verifyBobSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false; // different lengths
  }
}
```

Python:

```python
import base64, hashlib, hmac

def verify_bob_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False
    expected = base64.b64encode(
        hmac.new(secret.encode(), raw_body, hashlib.sha512).digest()
    ).decode()
    return hmac.compare_digest(signature_header, expected)
```

> **Ping test**: when you add a webhook, Bob first POSTs the text `Ping test` (or JSON `{"text":"Ping test"}`) and expects an immediate `200`. Handle it before parsing the body as an event.

> **For complete handlers with route wiring, event dispatch, and tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

The event name is the `type` field in the JSON body (webhooks v2); it is not sent in a header.

| Event | Description |
|-------|-------------|
| `employee.created` | An employee is created |
| `employee.updated` | An employee field is updated |
| `employee.joined` | Employee granted access, once the lifecycle entry is effective |
| `employee.left` | Employee terminated or on Garden leave |
| `timeoff.request.requested` | A time off request is submitted |
| `timeoff.request.approved` | A time off request is approved |

Other events include `employee.deleted`, `employee.activated`, `employee.inactivated`, `employee.temporaryLeave`, `employee.access.revoked.immediately`, `table.entry.created`, `table.entry.updated`, `timeoff.request.declined`, `timeoff.request.cancelled`, `timeoff.request.deleted`, `timeoff.request.updated`, `timeoff.request.imported`, `timeoff.request.setEndDate`, `todo.assign`, `todo.changedStatus`, `documents.eSign.completed`, and `workforcePlanning.*`. See [references/overview.md](references/overview.md).

Payloads carry metadata and IDs only (`companyId`, `type`, `version`, `triggeredBy`, `triggeredAt`, `data`). Call Bob's API to fetch the full record.

## Environment Variables

```bash
HIBOB_WEBHOOK_SECRET=your_bob_webhook_secret
```

## Local Development

```bash
npx hookdeck-cli listen 3000 hibob --path /webhooks/hibob
```

No account required. The CLI creates a guest account on first run and provides a local tunnel plus a web UI for inspecting requests. Use port `8000` for FastAPI.

## Reference Materials

- [references/overview.md](references/overview.md) - What Bob webhooks are, event types, payload structure, retries
- [references/setup.md](references/setup.md) - Configure a webhook in Bob and get the secret
- [references/verification.md](references/verification.md) - Signature details and gotchas

## Recommended: webhook-handler-patterns

We recommend installing [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) alongside this skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [hubspot-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hubspot-webhooks) - HubSpot CRM webhook signatures
- [intercom-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/intercom-webhooks) - Intercom `X-Hub-Signature` verification
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - Base64 HMAC signature in a header
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - Simple HMAC over the raw body
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - HMAC with timestamp
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
