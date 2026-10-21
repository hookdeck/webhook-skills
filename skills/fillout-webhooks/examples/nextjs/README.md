# Fillout Webhooks - Next.js Example

Minimal example of receiving [Fillout](https://www.fillout.com/) form submission webhooks
with the Next.js App Router, authenticated with an `Authorization: Bearer <token>` header.

Fillout doesn't sign webhooks. The route compares the whole `Authorization` header with
`Bearer ${FILLOUT_WEBHOOK_TOKEN}` in constant time, returns `401` on a mismatch, and
returns `500` if the token isn't configured.

## Prerequisites

- Node.js 20+
- A Fillout form you can edit
- A token you generate yourself: `openssl rand -hex 32`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put your token in `.env.local` as `FILLOUT_WEBHOOK_TOKEN` (without `Bearer `).

4. In Fillout, open the form → **Integrate** → **Webhook**, switch to **Advanced**, and:
   - HTTP method: `POST`
   - Body: map `submissionId` → Submission ID, plus the answers you need
   - Headers: `Authorization` = `Bearer <your token>`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/fillout`.

## Test

Run the tests:

```bash
npm test
```

Receive real webhooks locally with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 fillout --path /webhooks/fillout
```

Use the URL it prints as the webhook URL in Fillout and click **Test**.

## Files

- `app/webhooks/fillout/route.ts` - The `POST` route handler
- `lib/fillout.ts` - Header verification, payload parsing and submission types
- `test/webhook.test.ts` - Vitest tests
