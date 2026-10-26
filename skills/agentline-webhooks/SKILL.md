---
name: agentline-webhooks
description: >
  Receive and verify AgentLine webhooks. Use when setting up AgentLine (AI phone
  agent) webhook handlers, debugging X-Webhook-Signature verification, or
  handling events like call.received, call.utterance, call.completed and
  sms.received.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# AgentLine Webhooks

## When to Use This Skill

- How do I receive AgentLine webhooks?
- How do I verify AgentLine webhook signatures (`X-Webhook-Signature`)?
- How do I handle `call.completed`, `call.utterance` or `sms.received` events?
- Why is my AgentLine webhook signature verification failing?
- How do I test an AgentLine webhook with `webhook.test`?

## Verification (core)

AgentLine signs the **raw request body** with **HMAC-SHA256**, keyed with the
webhook signing secret as a UTF-8 string, and sends the **bare hex digest** (no
prefix, no timestamp) in the `X-Webhook-Signature` header. The secret is returned
in full **once** when the webhook is created and is masked on later reads. Always
verify against the **raw body**, never re-serialized JSON.

AgentLine has no published webhook SDK for Node (the Node package is not on npm),
so verify manually:

```javascript
const crypto = require('crypto');

function verifyAgentLineSignature(rawBody, signature, secret) {
  // Check shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  if (!/^[0-9a-f]{64}$/i.test(signature || '')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
```

```python
import hashlib, hmac

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes so a non-ASCII header returns False (401), not a TypeError (500)
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `call.received` | An inbound call is answered | Log the caller, start a session |
| `call.utterance` | A live caller turn (`conversation` uses `user` / `assistant` roles) | Live transcripts, real-time reply logic |
| `call.completed` | A call finishes | Persist the call record, fetch the transcript |
| `call.owner_task` | The agent hands a task to its owner | Create a follow-up task |
| `call.failed` | A call fails | Alerting, retry |
| `call.busy` | The callee line was busy | Schedule a retry |
| `call.no-answer` | The callee did not answer | Schedule a retry |
| `call.canceled` | A call was canceled | Clean up state |
| `sms.received` | An inbound SMS arrives | Conversation handling |
| `webhook.test` | You trigger a test delivery | Confirm the endpoint is wired up |

Each agent has **one** webhook URL that receives all of its events. Event objects
in AgentLine's events API have the shape `{ event_id, agent_id, event_type, payload, created_at }`;
the docs do not publish the exact HTTP delivery envelope, so the examples read
the type from `event_type` (falling back to `type` / `event`). Log a real
`webhook.test` delivery to confirm. See [references/overview.md](references/overview.md).

## Environment Variables

```bash
# Signing secret returned once when the webhook was created
AGENTLINE_WEBHOOK_SECRET=your_webhook_signing_secret
PORT=3000
```

## Setup

Create the webhook with `POST /v1/webhooks` (`agent_id`, `url`, optional `secret`), save
the returned `secret`, and **keep the default `X-Webhook-Signature` header**.
AgentLine allows a custom `signature_header`, but Hookdeck's AgentLine source
only checks `X-Webhook-Signature`, so a custom header is not supported. Details:
[references/setup.md](references/setup.md).

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 agentline --path /webhooks/agentline
```

No account required — the CLI creates a guest account on first run and provides a
local tunnel + web UI for inspecting requests. Express and Next.js examples use
port 3000; the FastAPI example uses `8000`.

## Resources

- [Overview](references/overview.md) - What AgentLine webhooks are, event types
- [Setup](references/setup.md) - Create the webhook, get the signing secret
- [Verification](references/verification.md) - Signature details and gotchas
- [Express Example](examples/express/) - Express.js implementation
- [Next.js Example](examples/nextjs/) - Next.js App Router implementation
- [FastAPI Example](examples/fastapi/) - Python FastAPI implementation

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Dedupe deliveries
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [retell-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/retell-webhooks) - Retell AI voice agent webhooks
- [vapi-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/vapi-webhooks) - Vapi voice agent webhooks
- [bland-ai-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/bland-ai-webhooks) - Bland AI phone call webhooks
- [elevenlabs-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/elevenlabs-webhooks) - ElevenLabs conversational AI webhooks
- [twilio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/twilio-webhooks) - Twilio voice and SMS webhooks
- [telnyx-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/telnyx-webhooks) - Telnyx telephony webhooks
- [openclaw-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/openclaw-webhooks) - OpenClaw agent webhooks
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub webhooks (simple HMAC-SHA256 hex)
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers
