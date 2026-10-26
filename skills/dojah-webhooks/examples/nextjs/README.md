# Dojah Webhooks - Next.js Example

Minimal example of receiving Dojah webhooks with signature verification (`x-dojah-signature`, HMAC-SHA256 hex of the raw body) using the App Router.

## Prerequisites

- Node.js 18+
- A Dojah webhook subscription and its webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `DOJAH_WEBHOOK_SECRET` in `.env.local`. Paste the webhook secret from Developers > Webhooks, not your API secret key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook endpoint is `POST /webhooks/dojah`.

## Test

Run the unit tests (they generate real signatures):

```bash
npm test
```

To receive real webhooks locally, run the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 dojah --path /webhooks/dojah
```

Then subscribe the URL it prints to a Dojah service (for example `kyc_widget`).

## Notes

- The route reads the body with `await request.arrayBuffer()` so the signature is checked over the exact bytes sent, whatever the `Content-Type`.
- A missing, empty or malformed `x-dojah-signature`, or a mismatch, returns `401`.
- Dojah has no event-name field; the route dispatches on `verification_status`. `Completed` means finished, not passed, so it also checks `status`.
- No timestamp is signed, so there is no replay window. Key your processing on `reference_id` to stay idempotent.
