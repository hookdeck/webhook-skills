# Metronome Webhooks - Next.js Example

Minimal example of receiving Metronome webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- Metronome account with a webhook and its secret key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Metronome webhook secret key to `.env.local` as `METRONOME_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

The tests include the worked example from Metronome's docs (secret `correct-horse-battery-staple`, signature `b82652fa2246cf1d8a27e591f155c865f68b46c19b9213fd9c052f2419b4742b`).

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 metronome --path /webhooks/metronome
```

Paste the URL the CLI prints into your Metronome webhook configuration.

## Notes

- The route reads `await request.arrayBuffer()` so the exact bytes are verified for any content type; the JSON is parsed only after the check.
- Verification lives in `lib/metronome.ts` (route files should only export handlers).
- The signature covers `X-Metronome-Date`, a newline (LF), then the raw body. Failures return `401`.
- Old `X-Metronome-Date` values are accepted by default (retries and replays resend them). Set `METRONOME_WEBHOOK_TOLERANCE_SECONDS` to opt in to a window.
- Duplicates are possible: the handler dedupes on the body's `id` (in memory here; use a shared store in production).
