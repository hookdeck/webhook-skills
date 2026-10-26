# Ardoq Webhooks - Next.js Example

Minimal example of receiving Ardoq webhooks with `X-Ardoq-Signature-256` HMAC-SHA256 verification, using the App Router.

## Prerequisites

- Node.js 18+
- An Ardoq organization with webhooks enabled (Ardoq enables them per organization on request) and an admin account to create the webhook
- The webhook's signing secret (Ardoq shows it only once)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your webhook's signing secret to `.env.local` as `ARDOQ_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward Ardoq webhooks to your local server (no account needed)
npx hookdeck-cli listen 3000 ardoq --path /webhooks/ardoq
```

Paste the HTTPS URL the CLI prints as the destination URL when you create the webhook in Ardoq (signed webhooks require HTTPS). Then make a small change in Ardoq, such as adding and removing a tag on a component.

### Run Unit Tests

```bash
npm test
```

## Structure

- `app/webhooks/ardoq/route.ts` — `POST /webhooks/ardoq`: reads the raw bytes with `await request.arrayBuffer()`, verifies, then parses and dispatches.
- `lib/ardoq.ts` — `verifyArdoqSignature` and `handleArdoqEvent`, kept out of the route file so the route only exports `POST`.

## Notes

- **Raw body is required.** Never call `request.json()` before verifying; the signature covers the exact bytes Ardoq sent.
- **Missing or invalid signature returns 401.** A correctly signed body that is not JSON returns 400.
- **No timestamp window by default.** Hookdeck retries and replays resend the original timestamp. To opt in, set `ARDOQ_WEBHOOK_TOLERANCE_SECONDS` (Unix seconds).
- **Signed webhooks only deliver component, reference and tag changes**, and there are no deletion events.
