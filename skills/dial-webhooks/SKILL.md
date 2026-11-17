---
name: dial-webhooks
description: >
  Receive and verify Dial webhooks. Use when setting up Dial (phone numbers
  for AI agents: SMS, iMessage, WhatsApp and AI voice calls) webhook handlers,
  debugging X-Dial-Signature verification, or handling events like
  message.received, message.status_changed, call.ended and call.transcribed.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Dial Webhooks

## When to Use This Skill

- How do I receive Dial webhooks?
- How do I verify Dial webhook signatures (`X-Dial-Signature`)?
- How do I handle `message.received` (SMS, iMessage, WhatsApp) or `call.ended` events?
- How do I get a call transcript when `call.transcribed` arrives?
- Why is my Dial webhook signature verification failing?
- How do I test a Dial webhook with `webhook.ping`?

## Verification (core)

Dial sends `X-Dial-Signature: t=<unix-seconds>,v1=<hex>`. `v1` is the lowercase hex
**HMAC-SHA256** of `{t}.{raw request body}`, keyed with the **full signing secret as a
UTF-8 string, `whsec_` prefix included**. It is not Standard Webhooks: do not
base64-decode the secret. Always verify against the **raw body**, never re-serialized
JSON, and reject stale timestamps to limit replay (Dial's docs suggest 5 minutes).

Dial publishes no webhook verification SDK, so verify manually:

```javascript
const crypto = require('crypto');

function verifyDialSignature(rawBody, header, secret, toleranceSeconds = 300) {
  let t = null;
  const v1 = [];
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key === 't') t = value;
    else if (key === 'v1') v1.push(value);
  }
  if (!t || !/^\d+$/.test(t) || v1.length === 0) return false;
  if (toleranceSeconds > 0 && Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  // Check shape first: Buffer.from(x, 'hex') silently truncates invalid hex
  return v1.some((sig) => /^[0-9a-f]{64}$/i.test(sig) && crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex')));
}
```

```python
import hashlib, hmac, time

def verify(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = [p.split("=", 1) for p in header.split(",") if "=" in p]
    t = next((v.strip() for k, v in parts if k.strip() == "t"), "")
    sigs = [v.strip().lower() for k, v in parts if k.strip() == "v1"]
    if not t.isascii() or not t.isdigit() or not sigs:
        return False
    if tolerance > 0 and abs(time.time() - int(t)) > tolerance:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    # Compare bytes so a non-ASCII header returns False (401), not a TypeError (500)
    return any(hmac.compare_digest(expected, s.encode()) for s in sigs)
```

> **Retries and replays:** Dial signs every one of its own retry attempts with a fresh
> `t`, so a 5-minute window is safe for direct delivery. Hookdeck retries and replays
> resend the **original** `t`, so behind Hookdeck widen or disable the window
> (`DIAL_WEBHOOK_TOLERANCE_SECONDS`, `0` disables) and rely on deduplicating
> `X-Dial-Event-ID` instead. See [references/verification.md](references/verification.md).

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `message.received` | An inbound SMS, MMS, iMessage, RCS or WhatsApp message arrives (incl. group messages) | Reply from the agent, read one-time codes |
| `message.status_changed` | An outbound message is delivered, rejected or read | Confirm delivery, alert on failures, read receipts |
| `call.status_changed` | A call moves through `Queued` → `Ringing` → `In-Progress` → `Terminated` | React the moment a call rings or is answered |
| `call.ended` | A voice call (inbound or outbound) finishes | Record the outcome and duration |
| `call.transcribed` | A call's transcript is ready | Fetch `GET /api/v1/calls/{id}` for the transcript |
| `number.status_changed` | A phone number's capabilities settle (`unsettled` / `ready` / `degraded`) | Start using a newly bought number |
| `webhook.ping` | You fire a test ping at one subscription | Confirm the endpoint is reachable and verifying |

Every delivery has the same envelope: `{ id, object: "event", type, version, createdAt,
relatedObject, data }`. Route on `type` (also in the `X-Dial-Event-Type` header) and
dedupe on `id` (also in `X-Dial-Event-ID`). `version` is per event type:
`number.status_changed` is at `2`, the others at `1`. See
[references/overview.md](references/overview.md).

## Environment Variables

```bash
# Full signing secret, whsec_ prefix included
DIAL_WEBHOOK_SECRET=whsec_your_signing_secret
# Max age of the signed timestamp in seconds (0 disables the check)
DIAL_WEBHOOK_TOLERANCE_SECONDS=300
PORT=3000
```

## Setup

Create a subscription in the [Dial dashboard](https://getdial.ai/dashboard/webhooks) or
with `POST https://api.getdial.ai/api/v1/webhooks` (`targetUrl`, `eventTypes`), then read
the full secret from `GET /api/v1/webhooks/{id}/secret`. The `targetUrl` must be HTTPS
and public. Details: [references/setup.md](references/setup.md).

## Local Development

For local webhook testing, run the Hookdeck CLI via `npx` — no install required:

```bash
npx hookdeck-cli listen 3000 dial --path /webhooks/dial
```

No account required — the CLI creates a guest account on first run and provides a
public HTTPS URL + web UI for inspecting requests. Use that URL as the subscription's
`targetUrl`, then fire a ping. Express and Next.js examples use port 3000; the FastAPI
example uses `8000`.

## Resources

- [Overview](references/overview.md) - What Dial webhooks are, event types, envelope
- [Setup](references/setup.md) - Create the subscription, get the signing secret, ping it
- [Verification](references/verification.md) - Signature details, timestamp window, gotchas
- [Express Example](examples/express/) - Express.js implementation
- [Next.js Example](examples/nextjs/) - Next.js App Router implementation
- [FastAPI Example](examples/fastapi/) - Python FastAPI implementation

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Dedupe deliveries on `X-Dial-Event-ID`
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [linq-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/linq-webhooks) - Linq iMessage/RCS/SMS webhooks
- [twilio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/twilio-webhooks) - Twilio voice and SMS webhooks
- [telnyx-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/telnyx-webhooks) - Telnyx telephony webhooks
- [whatsapp-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/whatsapp-webhooks) - WhatsApp messaging webhooks
- [vapi-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/vapi-webhooks) - Vapi voice agent webhooks
- [openclaw-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/openclaw-webhooks) - OpenClaw agent webhooks
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe webhooks (same `t=…,v1=…` header shape)
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers
