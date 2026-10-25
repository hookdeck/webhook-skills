---
name: textus-webhooks
description: >
  Receive and verify TextUs webhooks. Use when setting up TextUs webhook
  handlers, debugging TextUs signature verification (X-TextUs-Signature,
  HMAC-SHA256), or handling business texting events like message.received,
  message.delivered, contact.opted_out, and contact.created.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# TextUs Webhooks

TextUs (business texting) POSTs a JSON payload to your HTTPS endpoint whenever a
subscribed event happens, such as an inbound text or a contact opting out. Each
delivery carries an HMAC-SHA256 signature in the `X-TextUs-Signature` header that
you should verify before trusting the event.

## When to Use This Skill

- How do I receive TextUs webhooks?
- How do I verify the `X-TextUs-Signature` header?
- How do I handle `message.received`, `message.delivered`, or `contact.opted_out` events?
- Why is my TextUs webhook signature verification failing?
- How do I register a TextUs webhook with the Integrations API?

## How TextUs Signs Webhooks

TextUs uses a **plain HMAC scheme** (not Standard Webhooks, no timestamp in the signature):

| Item | Value |
|------|-------|
| Header | `X-TextUs-Signature` |
| Algorithm | HMAC-SHA256 |
| Signed content | The raw request body, exactly as received |
| Key | The webhook's secret, e.g. `textus-HOTh4kXxHIbYst0xutpkdw` |
| Encoding | Bare lowercase hex (64 characters, no `sha256=` prefix) |

The **whole secret string, including the `textus-` prefix,** is the HMAC key
(as UTF-8). Do not strip the prefix or base64-decode anything. There is no
official TextUs SDK for verification, so every framework verifies manually.

## Verification (core)

```javascript
const crypto = require('crypto');

// rawBody: Buffer of the unparsed request body. header: X-TextUs-Signature.
function verifyTextUsSignature(rawBody, header, secret) {
  // Validate hex first: Buffer.from(x, 'hex') silently truncates bad input.
  if (typeof header !== 'string' || !/^[0-9a-f]{64}$/i.test(header)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(header, 'hex'), expected);
}
```

In Python, compare **bytes** so a non-ASCII header yields a failed check (401)
rather than a `TypeError` (500):

```python
expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
valid = hmac.compare_digest(expected.encode(), header.lower().encode())
```

> **Use the raw request body.** In Express use `express.raw({ type: '*/*' })` so
> any content type is captured as a Buffer; re-serialized JSON changes the bytes.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Event Payload Structure

Every delivery has an `action` field naming the event, a `timestamp`, and a link
to the owning webhook, plus an object for the event (`message` and
`conversation` for message events, `contact` for `contact.created`, `optOut`
for opt-out/opt-in events):

```json
{
  "action": "message.received",
  "timestamp": "2026-10-20T18:38:00Z",
  "webHook": "/integrations/123",
  "conversation": { "id": "..." },
  "message": { "id": "...", "body": "Hello" }
}
```

## Common Event Types

| Event | Triggered When |
|-------|----------------|
| `message.received` | An incoming message is received |
| `message.delivered` | An outgoing message is delivered |
| `message.failed` | An outgoing message failed to deliver |
| `message.unknown` | An outgoing message could not be delivered due to an unknown error |
| `phone_call.completed` | A phone call is completed |
| `contact.opted_out` | A contact opted out of receiving text messages |
| `contact.opted_in` | A contact opted in to receiving text messages |
| `contact.created` | A contact is created |

The web app only sends `message.delivered` and `message.received` by default;
enable the others through the Integrations API. Branch on `action` and ignore
unknown values. See [references/overview.md](references/overview.md).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `TEXTUS_WEBHOOK_SECRET` | The webhook's secret (the full `textus-...` string) |

## Setup

Register an endpoint in the TextUs web app (Settings > Account Settings >
Integrations > Webhooks) or with `POST /{account-name}/integrations`. See
[references/setup.md](references/setup.md).

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 textus --path /webhooks/textus
```

No account required — the CLI creates a guest account on first run and provides
a local tunnel + web UI for inspecting requests.

## Reference Materials

- [overview.md](references/overview.md) — What TextUs webhooks are, event types, payloads
- [setup.md](references/setup.md) — Registering your endpoint and configuring the secret
- [verification.md](references/verification.md) — Signature verification details and gotchas
- [examples/express/](examples/express/) — Express (Node.js) example with tests
- [examples/nextjs/](examples/nextjs/) — Next.js App Router example with tests
- [examples/fastapi/](examples/fastapi/) — FastAPI (Python) example with tests

## Recommended: webhook-handler-patterns

Install [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns)
alongside this skill for cross-cutting concerns:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [twilio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/twilio-webhooks) - SMS and voice webhooks
- [telnyx-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/telnyx-webhooks) - Messaging and voice events
- [bird-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/bird-webhooks) - Omnichannel messaging webhooks
- [attentive-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/attentive-webhooks) - SMS marketing events
- [aircall-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/aircall-webhooks) - Business phone call events
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - HMAC-SHA256 signature verification
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
