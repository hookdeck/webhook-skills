# Linear Webhooks - Next.js Example

Minimal Linear webhook handler implemented as a Next.js App Router route. Verifies the `Linear-Signature` HMAC-SHA256 header against the raw request body and enforces the 1 minute `webhookTimestamp` freshness window.

## Prerequisites

- Node.js 18+
- A Linear workspace with a webhook configured (see [setup guide](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Linear webhook signing secret to `.env.local`.

## Run

```bash
npm run dev
```

The webhook is served at `POST /webhooks/linear` (e.g. `http://localhost:3000/webhooks/linear`).

## Test

```bash
npm test
```

Runs Vitest. Tests generate real Linear-style HMAC-SHA256 signatures and exercise the verifier, the freshness check, and the route handler directly via `NextRequest`.

### Send a real Linear webhook

```bash
npx hookdeck-cli listen 3000 linear --path /webhooks/linear
```

Paste the printed URL into Linear → **Workspace settings → API → Webhooks**.

## File Layout

- `app/webhooks/linear/route.ts` — App Router POST handler with verification
- `test/webhook.test.ts` — Vitest unit tests
- `vitest.config.ts` — Vitest config (Node environment)
