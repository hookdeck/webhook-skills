---
name: sendgrid-inbound-webhooks
description: >
  Receive and verify Twilio SendGrid Inbound Parse webhooks — inbound email
  POSTed to your endpoint as multipart/form-data. Use when setting up a
  SendGrid Inbound Parse handler, parsing the headers/text/html/envelope/
  attachment-info form fields or the raw MIME `email` field, debugging
  X-Twilio-Email-Event-Webhook-Signature ECDSA verification failures, handling
  the OAuth Bearer token path, or routing inbound mail on envelope.to. This is
  Inbound Parse (receiving email), NOT the SendGrid Event Webhook (delivered,
  bounce, open, click) — see sendgrid-webhooks for that.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# SendGrid Inbound Parse Webhooks

Twilio SendGrid **Inbound Parse** receives email sent to an MX-pointed hostname
you control, and POSTs each message to your webhook endpoint as
`multipart/form-data`. Hookdeck source type: `SENDGRID_INBOUND`
("SendGrid Inbound Parse").

## When to Use This Skill

- How do I receive inbound email with SendGrid Inbound Parse?
- How do I verify SendGrid Inbound Parse webhook signatures?
- Why is my SendGrid Inbound Parse signature verification failing?
- How do I parse the `envelope`, `attachment-info`, `charsets` or `content-ids` fields?
- How do I handle attachments from Inbound Parse?
- What is the difference between the default and raw (`send_raw`) payload formats?
- How do I route inbound email to the right mailbox handler?
- How do I respond to an expired SendGrid OAuth access token?

## Not the SendGrid Event Webhook

Two different SendGrid features share the ECDSA primitive and the same two HTTP
headers, and nothing else:

| | **Inbound Parse** (this skill) | **Event Webhook** ([sendgrid-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sendgrid-webhooks)) |
|---|---|---|
| Direction | Email **in** | Engagement events **out** |
| Body | `multipart/form-data`, one POST per email | JSON **array** of event objects |
| Event types | **None** — the only "event" is an email arriving | `delivered`, `bounce`, `open`, `click`, … |
| Routing | On the recipient (`to` / `envelope.to`) | On `event` |
| Signing | Opt-in, via an API **security policy** | UI toggle in Settings → Mail Settings |
| Signing default | **Off** — unsigned unless you attach a policy | Off until enabled |

There is **no** `type` or `event` discriminator field on an Inbound Parse POST.
Do not write a `switch (payload.event)` here.

## Verification (core)

Signing is **opt-in**. A Parse webhook with no security policy attached sends
**no signature header at all**. When a public key *is* configured, never fall
back to accepting unsigned requests.

```javascript
const crypto = require('crypto');

// ECDSA P-256 / SHA-256 — NOT HMAC. Signed content is `timestamp + raw body`
// concatenated as RAW BYTES, no separator. The signature is base64 of an
// ASN.1/DER (r,s) SEQUENCE, which crypto.verify expects natively.
function verifyInboundParse(publicKeyB64, rawBody, signature, timestamp) {
  if (!publicKeyB64 || !rawBody || !signature || !timestamp) return false;
  try {
    // The API returns base64 DER SubjectPublicKeyInfo — NOT PEM.
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki',
    });
    // rawBody MUST be the exact bytes received. The body is multipart/form-data
    // carrying binary attachments — parsing or .toString()-ing it first
    // corrupts those bytes and verification fails.
    const signed = Buffer.concat([Buffer.from(String(timestamp), 'utf8'), rawBody]);
    return crypto.verify('sha256', signed, key, Buffer.from(signature, 'base64'));
  } catch {
    return false; // malformed key or signature — reject, never throw
  }
}
// Headers: X-Twilio-Email-Event-Webhook-Signature (base64)
//          X-Twilio-Email-Event-Webhook-Timestamp (Unix seconds, as a string)
// Yes, the header names say "Event-Webhook" on Inbound Parse too. Verbatim from the docs.
```

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## The load-bearing gotcha: capture the raw body first

The docs carry an explicit WARNING: *"Some web frameworks automatically parse
multipart data and separate file uploads from the rest of the request body.
This can break signature validation."* and instruct: *"Do not parse or modify
the request body before validating the signature. Use the raw request body
exactly as it was received to generate your signature hash."*

| Framework | Do this | Never this |
|---|---|---|
| Express | `express.raw({ type: 'multipart/form-data', limit: '30mb' })` mounted **before** any multipart middleware | `express.urlencoded()`, `express.json()`, or a bare `multer()` on the route |
| Next.js App Router | `const buf = Buffer.from(await req.arrayBuffer())`, verify, then re-parse with `new Response(buf, { headers }).formData()` | `await req.formData()` first — the raw bytes are gone |
| FastAPI | `raw = await request.body()` **first**, verify, then `await request.form()` | `await request.form()` first — it consumes the stream |

Stringifying the body is also destructive: `Buffer.toString('utf8')` replaces
every invalid UTF-8 byte in a binary attachment with `U+FFFD`. This is why the
Node `@sendgrid/eventwebhook` helper **cannot** verify Inbound Parse requests
with binary attachments — it calls `payload.toString()` internally. Use
`crypto.verify` on the raw `Buffer`. See [verification.md](references/verification.md).

## Payload shape

One POST per inbound email. Body shape depends on the Parse Setting's
`send_raw` flag — **handlers should tolerate both**.

**Default (`send_raw: false`)** — form fields exactly:
`headers`, `dkim`, `content-ids`, `to`, `text`, `html`, `from`, `sender_ip`,
`spam_report`, `envelope`, `attachments`, `subject`, `spam_score`,
`attachment-info`, `charsets`, `SPF`.

**Raw (`send_raw: true`)** — form fields exactly:
`dkim`, `email`, `to`, `from`, `sender_ip`, `spam_report`, `envelope`,
`subject`, `spam_score`, `charsets`, `SPF`. `email` holds the entire raw MIME
message. There is no `headers`, `html`, `text`, `attachments`, `content-ids` or
`attachment-info` in this mode.

Traps in both modes:

- `SPF` is **upper-case**; `content-ids` and `attachment-info` are **hyphenated**
  (bracket access in JS, not dot).
- `envelope`, `to`, `charsets`, `content-ids` and `attachment-info` are JSON
  **strings** — `JSON.parse` them. `envelope` is
  `{"to":["x@y.com"],"from":"a@b.com"}`; `envelope.to` is a single-element array.
- `attachments` is a **count** (a string like `"2"`), not a list. Each attachment
  is a separate multipart **file part** named `attachment1`, `attachment2`, …
- `dkim` is a bare string like `{@sendgrid.com : pass}`. It looks like JSON and
  is **not** valid JSON — do not `JSON.parse` it.
- `spam_score` / `spam_report` only appear when the Parse Setting has
  `spam_check: true`.
- Keep total message size (body + attachments) under **30 MB**.

Full field table: [overview.md](references/overview.md).

## Response contract

Return 2xx quickly. When rejecting because the **OAuth access token** is expired
or invalid, the docs require a 4xx **and** a body containing one of exactly
these strings — SendGrid caches its access token and this is the only signal
that makes it fetch a fresh one:

| Status | Body must contain | Meaning (RFC 6750 §3.1) |
|---|---|---|
| `400` | `invalid_request` | Malformed / missing / duplicated token |
| `401` | `invalid_token` | Expired, revoked, malformed, otherwise invalid |
| `403` | `insufficient_scope` | Token lacks required privileges |

A plain `401` with an empty or custom body leaves the stale token cached.

## Environment Variables

```bash
# Base64 DER SubjectPublicKeyInfo — the `policy.signature.public_key` value
# returned by POST /v3/user/webhooks/security/policies. NOT PEM.
# Unset means "no security policy attached" and the handler accepts unsigned
# requests with a loud warning. Set it and verification is strictly enforced.
SENDGRID_INBOUND_PUBLIC_KEY="MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE..."

# Optional replay window in seconds. Unset/0 disables the check (the default)
# so clock skew never silently drops mail.
SENDGRID_INBOUND_MAX_AGE_SECONDS=

# Set to true when your security policy includes an `oauth` block.
SENDGRID_INBOUND_REQUIRE_OAUTH=false
```

## Verifying behind a proxy or gateway

Anything between SendGrid and your handler must pass the body through as bytes.
A proxy that decodes the body as UTF-8 and re-encodes it is lossless only while
every byte is valid UTF-8 — true for a text-only email, false as soon as an
attachment carries arbitrary bytes. The signature then fails on exactly the
messages that have attachments, which reads as an intermittent bug.

Hookdeck is mid-rollout on exactly this. Binary payload passthrough has landed;
multipart is the next stage and not shipped yet, so as of September 2026 a
multipart request is still ingested on the text path and the body is decoded to a
string before it reaches your destination. Text-only mail round-trips unchanged
and verifies; mail with a binary attachment does not. Once multipart moves to the
binary path this caveat stops applying and only the generic proxy warning above
matters. Until then, two options:

- Verify at the edge — terminate the SendGrid POST on your own endpoint, check
  the signature against the raw bytes there, and forward the already-verified
  result onward.
- Or set the Parse Setting to `send_raw: true`. The raw MIME format base64-encodes
  attachments inside the `email` field, so the whole body stays 7-bit ASCII and
  survives a UTF-8 round trip. This changes the payload shape — see
  [overview.md](references/overview.md).

## Local Development

```bash
npx hookdeck-cli listen 3000 sendgrid-inbound --path /webhooks/sendgrid-inbound
```

No account required — the CLI creates a guest account on first run and provides
a local tunnel plus a web UI for inspecting requests. Use `8000` for FastAPI.

The same caveat applies here, and the CLI adds one of its own: it does not
deliver binary payloads at all. Develop against `send_raw: true`, or against
text-only mail, and keep an end-to-end signature test on a direct HTTPS endpoint.

## Resources

- [overview.md](references/overview.md) — What Inbound Parse is, both payload formats, the full form-field table
- [setup.md](references/setup.md) — MX record, authenticated domain, creating the Parse Setting, attaching a security policy over the API
- [verification.md](references/verification.md) — ECDSA details, per-framework raw-body capture, OAuth, debugging
- [examples/](examples/) — Runnable Express, Next.js and FastAPI handlers with tests

## Recommended: webhook-handler-patterns

Install [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns)
alongside this skill for cross-cutting concerns:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [sendgrid-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/sendgrid-webhooks) — The SendGrid **Event Webhook** (delivered, bounce, open, click); same ECDSA primitive, JSON array body
- [mailgun-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mailgun-webhooks) — Mailgun email events and inbound routes
- [postmark-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/postmark-webhooks) — Postmark inbound and delivery webhooks
- [mailersend-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mailersend-webhooks) — MailerSend email event webhooks
- [mailchimp-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/mailchimp-webhooks) — Mailchimp list and campaign webhooks
- [twilio-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/twilio-webhooks) — Twilio messaging and voice webhooks (`X-Twilio-Signature`, a different scheme)
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) — Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) — Production webhook infrastructure: guaranteed delivery, retries, replay, rate limiting, observability
