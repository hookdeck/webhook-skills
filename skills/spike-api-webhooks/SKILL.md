---
name: spike-api-webhooks
description: >
  Receive and verify Spike API webhooks. Use when setting up Spike API (unified
  health and wearables data API) webhook handlers, debugging X-Body-Signature
  verification, or handling record_change, provider_integration_created and
  provider_integration_deleted events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Spike API Webhooks

## When to Use This Skill

- How do I receive Spike API webhooks?
- How do I verify Spike API webhook signatures (`X-Body-Signature`)?
- How do I handle `record_change`, `provider_integration_created` or `provider_integration_deleted` events?
- Why is my Spike API webhook signature verification failing?
- Why does Spike API keep retrying my webhook?

## Verification (core)

Spike API signs the **raw request body** with **HMAC-SHA256**, keyed with the
shared secret from the admin console (used as-is, as UTF-8 bytes), and sends the
**bare lowercase hex digest** (no prefix, no timestamp) as the whole
`X-Body-Signature` header value. Always verify against the **raw body**, never
re-serialized JSON. There is no Spike API webhook SDK, so verify manually:

```javascript
const crypto = require('crypto');

function verifySpikeSignature(rawBody, signature, secret) {
  // Check shape first: Buffer.from(x, 'hex') silently drops invalid characters
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}
```

```python
import hashlib, hmac, re

def verify(raw_body: bytes, signature: str, secret: str) -> bool:
    if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes, never str
    return hmac.compare_digest(expected.encode(), signature.lower().encode())
```

A missing, empty or malformed header, or a mismatch, is a `401`. Read the body
with `express.raw({ type: '*/*' })` (Express), `await request.arrayBuffer()`
(Next.js) or `await request.body()` (FastAPI), and parse JSON only after the check.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

The body is a **JSON array**; one delivery can batch several events, so loop over
every element. Each element carries its own `event_type`.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `record_change` | New or updated data arrives from a provider | Fetch the changed records (`metrics`, `activity_types`, `earliest_record_start_at`..`latest_record_end_at`) |
| `provider_integration_created` | A user connects a provider | Mark the integration active |
| `provider_integration_deleted` | A user's integration is deleted | Stop syncing, clean up |

Treat every parsed field as untrusted: check that the body is an array and that
each element and nested field has the expected type before reading it. See
[references/overview.md](references/overview.md).

## Delivery Rules

Respond with exactly HTTP `200` within 30 seconds. Any other status, a network
error or a timeout is retried up to 10 times (5 s, 2 min, 30 min, 2 h, then every
12 h); after that the event is discarded. Return `200` quickly and process
asynchronously, and make handling idempotent.

## Environment Variables

```bash
# Shared HMAC key from the Spike API admin console
SPIKE_API_WEBHOOK_SECRET=your_spike_api_webhook_secret
```

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 spike-api --path /webhooks/spike-api
```

No account required — the CLI creates a guest account on first run and provides a
local tunnel + web UI for inspecting requests. Express and Next.js examples use
port 3000; the FastAPI example uses `8000`.

## Resources

- [Overview](references/overview.md) - What Spike API webhooks are, event types and payloads
- [Setup](references/setup.md) - Configure the endpoint and get the shared key
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

- [oura-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/oura-webhooks) - Oura ring health data webhooks
- [polar-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/polar-webhooks) - Polar webhooks
- [strava-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/strava-webhooks) - Strava activity webhooks
- [agentline-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/agentline-webhooks) - Another bare hex HMAC-SHA256 of the raw body
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub webhooks (simple HMAC-SHA256 hex)
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers
