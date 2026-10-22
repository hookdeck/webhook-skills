---
name: zoho-sign-webhooks
description: >
  Receive and verify Zoho Sign webhooks. Use when setting up Zoho Sign webhook
  handlers, debugging X-ZS-WEBHOOK-SIGNATURE HMAC verification, or handling
  e-signature events like RequestSubmitted, RequestSigningSuccess,
  RequestCompleted, RequestRejected and RequestExpired.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Zoho Sign Webhooks

Zoho Sign is Zoho's e-signature product. Admins register up to two webhooks per account
(Enterprise, API, Zoho One and People Plus plans). Each delivery is a JSON body with a
`requests` object (the signature request) and a `notifications` object (what happened).
**HMAC signing is opt-in per webhook**: tick the HMAC signature checkbox and Zoho Sign adds
the `X-ZS-WEBHOOK-SIGNATURE` header.

## When to Use This Skill

- How do I receive Zoho Sign webhooks?
- How do I verify the `X-ZS-WEBHOOK-SIGNATURE` header?
- Why does my Zoho Sign HMAC verification fail?
- How do I handle `RequestCompleted` or `RequestSigningSuccess` events?
- How do I secure a Zoho Sign webhook endpoint?

## Resources

- [references/overview.md](references/overview.md) - What Zoho Sign webhooks are, `operation_type` values, payload
- [references/setup.md](references/setup.md) - Register a webhook and set the secret key
- [references/verification.md](references/verification.md) - Signature details and gotchas
- [examples/](examples/) - Runnable Express, Next.js and FastAPI handlers

## Verification (core)

The signature is `base64(HMAC-SHA256(key = secret as UTF-8, message = raw request body))` in
`X-ZS-WEBHOOK-SIGNATURE`. No timestamp is signed.

```javascript
const crypto = require('crypto');

function verifyZohoSign(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

Zoho's docs write the formula as `HMAC SHA-256(payload+secret_key)`. That wording is
misleading: the secret is the HMAC **key**, it is not appended to the payload. Use the raw
body bytes (`express.raw({ type: '*/*' })` in Express) so any content type verifies.

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Event Types

The event is `notifications.operation_type`:

| operation_type | Fires when |
|----------------|-----------|
| `RequestSubmitted` | A document is submitted for signature |
| `RequestViewed` | A submitted document is viewed |
| `RequestSigningSuccess` | One signer completes signing |
| `RequestCompleted` | All signers/approvers have finished |
| `RequestRejected` | A signer rejects the request |
| `RequestRecalled` | The sender recalls the request |
| `RequestForwarded` | A signer forwards the request to someone else |
| `RequestExpired` | The signing deadline passes |

## Environment Variables

```bash
ZOHO_SIGN_WEBHOOK_SECRET=your_secret_key   # the key you entered/generated in Zoho Sign
```

## Local Development

```bash
# Express / Next.js
npx hookdeck-cli listen 3000 zoho-sign --path /webhooks/zoho-sign
# FastAPI
npx hookdeck-cli listen 8000 zoho-sign --path /webhooks/zoho-sign
```

No account required: the CLI creates a guest account on first run and gives you a tunnel
plus a web UI for inspecting requests.

## Recommended: webhook-handler-patterns

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [docusign-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/docusign-webhooks) - DocuSign Connect envelope events
- [cloudsignal-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/cloudsignal-webhooks) - CloudSignal webhooks
- [dropbox-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/dropbox-webhooks) - Dropbox file change webhooks
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - HMAC-SHA256 with base64 digest
- [aftership-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/aftership-webhooks) - base64 HMAC-SHA256 of the raw body
- [formstack-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/formstack-webhooks) - Forms and document workflow webhooks
- [zendesk-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/zendesk-webhooks) - Support ticket webhooks
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
