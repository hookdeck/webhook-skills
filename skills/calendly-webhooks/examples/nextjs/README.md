# Calendly Webhooks - Next.js Example

Minimal example of receiving Calendly webhooks with signature verification using the
Next.js App Router.

## Prerequisites

- Node.js 18+
- A Calendly webhook subscription with a signing key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Calendly webhook signing key to `.env` as `CALENDLY_WEBHOOK_SIGNING_KEY`.

## Run

```bash
npm run dev
```

The webhook route is available at http://localhost:3000/webhooks/calendly

## Test

Run the test suite (generates real signatures and verifies the route handler):

```bash
npm test
```

### Receive live webhooks locally

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 calendly --path /webhooks/calendly
```

Point your Calendly webhook subscription's `url` at the tunnel URL, then schedule,
cancel, or mark a no-show on an event.

## How It Works

- The App Router handler reads the **raw** body with `await request.text()`.
- Reads the `Calendly-Webhook-Signature` header (`t=<ts>,v1=<sig>`).
- Computes HMAC-SHA256 (hex) over `{timestamp}.{raw body}` and compares timing-safe.
- Rejects timestamps older than 180 seconds to prevent replay attacks.

## Endpoint

- `POST /webhooks/calendly` - Receives and verifies Calendly webhook events
