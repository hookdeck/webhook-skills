# SendGrid Inbound Parse Webhooks — Express Example

Receives **inbound email** from Twilio SendGrid Inbound Parse and verifies the
ECDSA signature over the raw `multipart/form-data` body.

This is Inbound Parse, **not** the SendGrid Event Webhook (`delivered`,
`bounce`, `open`, `click`). The two share the ECDSA primitive and the same two
header names, and nothing else. There are **no event types** here — the only
"event" is an email arriving, so the handler routes on the recipient
(`envelope.to`).

## Prerequisites

- Node.js 18+ (the handler uses the global `Response`/`FormData` multipart parser)
- A SendGrid account with an authenticated domain and an MX record pointing at
  `mx.sendgrid.net`
- Optional but recommended: a webhook **security policy** with signature
  verification enabled, attached to your Parse Setting

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your public key in `.env` as `SENDGRID_INBOUND_PUBLIC_KEY`.

   It is the `policy.signature.public_key` value from
   `POST /v3/user/webhooks/security/policies` — **base64 DER, not PEM**. Paste
   it exactly as the API returned it.

   Leave it empty only if your Parse Setting genuinely has no security policy
   attached. SendGrid then sends no signature header at all and the handler
   accepts requests with a loud warning. Once the key is set, verification is
   strictly enforced and never falls back.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint
`POST /webhooks/sendgrid-inbound`.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 sendgrid-inbound --path /webhooks/sendgrid-inbound
```

Point your Parse Setting's `url` at the URL the CLI prints. No account required
— the CLI creates a guest account on first run and gives you a web UI for
inspecting and **replaying** requests, which matters here: an inbound email is
not repeatable, so replaying a captured multipart body byte-for-byte is the
practical way to iterate on attachment handling.

## Test

```bash
npm test
```

The suite generates real P-256 keys and real signatures, and covers:

- valid signatures over both the default and raw (`send_raw`) payload formats
- a body containing **binary attachment bytes** — the case that breaks
  naive implementations
- the regression that makes `@sendgrid/eventwebhook` unusable here: the same
  valid signature fails once the body has been round-tripped through a string
- tampered bodies, substituted timestamps, wrong keys, missing headers,
  malformed base64
- the opt-in replay window, off by default and enforced when configured
- the OAuth path and its RFC 6750 response contract (400/`invalid_request`,
  401/`invalid_token`, 403/`insufficient_scope`)
- field-level parsing traps: upper-case `SPF`, hyphenated `content-ids` /
  `attachment-info`, `envelope.to` as a single-element array, `attachments` as
  a count, and `dkim` as a bare string that is *not* JSON

Send a real test email once the tunnel is up:

```bash
echo "test body" | mail -s "test subject" anything@parse.example.com
```

Attach a file. A text-only test will not exercise the path that actually breaks.

## Key implementation points

**The raw body is captured before anything parses it.**

```javascript
app.post(
  '/webhooks/sendgrid-inbound',
  express.raw({ type: 'multipart/form-data', limit: '30mb' }),
  handler
);
```

SendGrid's docs warn under an explicit WARNING that frameworks which auto-parse
multipart data break signature validation, and instruct: *"Do not parse or
modify the request body before validating the signature."* Never mount
`express.urlencoded()`, `express.json()` or a bare `multer()` on this route.

The `30mb` limit matches SendGrid's advised maximum message size. The
`express.raw()` default of `100kb` silently rejects almost every real email with
an attachment.

**Verification is ECDSA, not HMAC.** P-256 + SHA-256 over
`timestamp + raw body bytes`, signature base64 of an ASN.1/DER `(r, s)`
SEQUENCE. `crypto.verify` expects DER natively, so there is no r/s splitting.

**Parsing happens after verification**, on the same bytes, using Node's built-in
`new Response(buf, { headers }).formData()` — no busboy or multer dependency.

See [../../references/verification.md](../../references/verification.md) for the
full breakdown and a debugging table.
