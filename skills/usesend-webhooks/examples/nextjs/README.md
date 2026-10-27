# useSend Webhooks - Next.js Example

Minimal example of receiving useSend webhooks in a Next.js App Router route with
signature verification.

## Prerequisites

- Node.js 18+
- A useSend account with a webhook and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your signing secret to `.env.local` as `USESEND_WEBHOOK_SECRET`. Paste the
   whole secret, including the whsec_ prefix. useSend uses it as a plain HMAC key.

## Run

```bash
npm run dev
```

The webhook route is `POST /webhooks/usesend` on http://localhost:3000
(`app/webhooks/usesend/route.ts`, with the verification in `lib/usesend.ts`).

## Test

Run the unit tests (they sign requests the way useSend does):

```bash
npm test
```

To receive real webhooks locally, run the Hookdeck CLI and put the URL it prints
in the useSend dashboard (Webhooks, then "Send Test" sends a `webhook.test` event):

```bash
npx hookdeck-cli listen 3000 usesend --path /webhooks/usesend
```

## How It Works

- The route reads the exact bytes with `await request.arrayBuffer()`, so any
  content type is verified against the raw body. JSON is parsed only afterwards.
- The signature is `v1=` plus the hex HMAC-SHA256 of
  `{X-UseSend-Timestamp}.{raw body}`, keyed with the whole secret.
- This is not Standard Webhooks, so there is no `svix` or `standardwebhooks` library.
- Old timestamps are accepted by default, because Hookdeck retries and replays
  resend the original timestamp. Set `USESEND_WEBHOOK_TOLERANCE_SECONDS` to opt in
  (the header is Unix milliseconds).
- A bad or missing signature returns `401`.
