# SendGrid Inbound Parse Webhooks — Next.js Example

Receives **inbound email** from Twilio SendGrid Inbound Parse in an App Router
route handler, and verifies the ECDSA signature over the raw
`multipart/form-data` body.

This is Inbound Parse, **not** the SendGrid Event Webhook (`delivered`,
`bounce`, `open`, `click`). The two share the ECDSA primitive and the same two
header names, and nothing else. There are **no event types** here — the only
"event" is an email arriving, so the handler routes on the recipient
(`envelope.to`).

## Prerequisites

- Node.js 18+
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
   cp .env.example .env.local
   ```

3. Put your public key in `.env.local` as `SENDGRID_INBOUND_PUBLIC_KEY`.

   It is the `policy.signature.public_key` value from
   `POST /v3/user/webhooks/security/policies` — **base64 DER, not PEM**.

   Do **not** prefix any of these variables with `NEXT_PUBLIC_`. That would
   inline them into the client bundle and serve them to every visitor. Route
   handlers run server-side and read `process.env` directly.

   Leave the key empty only if your Parse Setting genuinely has no security
   policy attached. SendGrid then sends no signature header at all and the
   route accepts requests with a loud warning. Once the key is set,
   verification is strictly enforced and never falls back.

## Run

```bash
npm run dev
```

Endpoint: `POST http://localhost:3000/webhooks/sendgrid-inbound`

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
- a body containing **binary attachment bytes** — the case that breaks naive
  implementations
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

## Key implementation points

**Read the raw bytes first, then re-parse the same bytes.**

```typescript
const rawBody = Buffer.from(await req.arrayBuffer());   // FIRST
// …verify…
const form = await new Response(new Uint8Array(rawBody), {
  headers: { 'content-type': req.headers.get('content-type')! },
}).formData();
```

SendGrid's docs warn under an explicit WARNING that frameworks which auto-parse
multipart data break signature validation, and instruct: *"Do not parse or
modify the request body before validating the signature."*

Calling `await req.formData()` first is unrecoverable — the raw bytes are not
retained and verification can never succeed afterwards.

`new Response(...).formData()` is a standards-compliant multipart parser built
into Node 18+, so no busboy or multer dependency is needed and parsing runs on
bytes that have already been verified.

**`export const runtime = 'nodejs'`** — verification uses `node:crypto`, which
is unavailable on the Edge runtime.

**Verification is ECDSA, not HMAC.** P-256 + SHA-256 over
`timestamp + raw body bytes`, signature base64 of an ASN.1/DER `(r, s)`
SEQUENCE. `crypto.verify` expects DER natively, so there is no r/s splitting.

**Body size.** SendGrid advises keeping total message size under 30 MB. If you
deploy behind a platform with a smaller request-body limit (Vercel's serverless
functions cap request bodies at 4.5 MB), large emails with attachments will be
rejected before your handler runs. Check your platform's limit against the mail
you actually expect.

See [../../references/verification.md](../../references/verification.md) for the
full breakdown and a debugging table.
