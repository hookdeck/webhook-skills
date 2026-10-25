---
name: rocketreach-webhooks
description: >
  Receive and verify RocketReach webhooks. Use when setting up RocketReach
  webhook handlers for People Lookup and Bulk People Lookup results, debugging
  X-RocketReach-Signature HMAC verification, or handling async contact lookup
  results (status complete, progress).
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# RocketReach Webhooks

RocketReach is a contact and company data API. Its webhooks are **not change events**: they
deliver the result of an asynchronous People Lookup or Bulk People Lookup, so you don't have to
poll the lookup status endpoint. A People Lookup delivers one profile object; a Bulk People
Lookup delivers a list of them. There are no event types. Each delivery carries an
`RR-Request-ID` header to correlate it with your request.

**Signing is opt-in**: once you generate a webhook secret, every delivery carries
`X-RocketReach-Signature`. Without a secret, deliveries are unsigned.

## When to Use This Skill

- How do I receive RocketReach webhooks?
- How do I verify the `X-RocketReach-Signature` header?
- Why does my RocketReach webhook signature verification fail?
- How do I handle People Lookup or Bulk People Lookup webhook results?
- How do I secure a RocketReach webhook endpoint?

## Resources

- [references/overview.md](references/overview.md) - What RocketReach webhooks deliver, payload shape
- [references/setup.md](references/setup.md) - Create a webhook, generate the secret, Hookdeck setup
- [references/verification.md](references/verification.md) - Signature details and gotchas
- [examples/](examples/) - Runnable Express, Next.js and FastAPI handlers

## Setup

1. On your RocketReach **API Usage & Settings** page, enter your webhook URL, check the
   endpoints you want, click **Create**, then enable it and click **Test Webhook**.
2. Click **Generate Secret** on the webhook and store the value. Without a secret, deliveries
   are unsigned and fail verification.
3. Pass the webhook's ID as `webhook_id` on People Lookup or Bulk People Lookup requests (the
   top-most enabled webhook is used if you omit it).

**Hookdeck setup:** create a RocketReach source in Hookdeck and generate a webhook secret in the
RocketReach API settings. Paste that secret into the source's webhook secret. Without a secret,
deliveries are unsigned and fail verification.

## Verification (core)

The signature is `base64(HMAC-SHA256(key = secret as UTF-8, message = raw request body))` in
`X-RocketReach-Signature`. No timestamp is signed.

```javascript
const crypto = require('crypto');

function verifyRocketReach(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

In Python, `hmac.compare_digest(expected_bytes, header.encode("utf-8"))` on bytes, so a non-ASCII
header gives a 401 instead of a 500. Use the raw body bytes (`express.raw({ type: '*/*' })` in
Express) so any content type verifies.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Payload

There is no event type field. The body is a profile object, or a list of them for bulk lookups:

```json
{ "profile_list": { "id": 1000, "name": "Example Profile List" }, "id": 123456, "status": "complete", ... }
```

`status` is `complete`, `progress`, `searching` or `not queued`; anything other than `complete`
means the contact info isn't fully available yet. See [references/overview.md](references/overview.md).

## Environment Variables

```bash
ROCKETREACH_WEBHOOK_SECRET=your_webhook_secret   # from Generate Secret on the API settings page
```

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 rocketreach --path /webhooks/rocketreach
# FastAPI
npx hookdeck-cli listen 8000 rocketreach --path /webhooks/rocketreach
```

No account required: the CLI creates a guest account on first run and gives you a tunnel
plus a web UI for inspecting requests.

## Recommended: webhook-handler-patterns

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [zoominfo-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/zoominfo-webhooks) - ZoomInfo data webhooks
- [salesloft-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/salesloft-webhooks) - Sales engagement webhooks
- [outreach-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/outreach-webhooks) - Outreach sales engagement webhooks
- [instantly-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/instantly-webhooks) - Cold email outreach webhooks
- [hubspot-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hubspot-webhooks) - CRM webhooks
- [pipedrive-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/pipedrive-webhooks) - CRM webhooks
- [zoho-sign-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/zoho-sign-webhooks) - Same base64 HMAC-SHA256 of the raw body scheme
- [aftership-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/aftership-webhooks) - base64 HMAC-SHA256 of the raw body
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
