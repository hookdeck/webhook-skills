# Ordinal Webhooks - Next.js Example

Receives [Ordinal](https://www.tryordinal.com/) (tryordinal.com) webhooks in a Next.js App
Router route handler and verifies each delivery's Standard Webhooks signature with the
`standardwebhooks` library, as Ordinal's docs recommend.

## Prerequisites

- Node.js 18+
- An Ordinal webhook and its `whsec_` signing secret (from the Create webhook response or
  the webhook's configure page)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables and set `ORDINAL_WEBHOOK_SECRET`:
   ```bash
   cp .env.example .env.local
   ```

3. Create the webhook in **Settings > Integrations > Webhooks** with the URL
   `https://<your-public-url>/webhooks/ordinal`, or with `POST /api/v1/webhooks`. Save
   `signingSecret` from the API response: later reads omit it.

## Run

```bash
npm run dev
```

The route is `POST /webhooks/ordinal` (`app/webhooks/ordinal/route.ts`).

## Test

```bash
npm test
```

The tests sign Ordinal's documented example payloads with a test secret and call the
route handler directly.

## Notes

- The handler reads `await request.text()` and verifies before parsing. Calling
  `request.json()` first loses the exact bytes the signature covers.
- `webhook-id` is the same on a retry, so the example deduplicates on it.
- Route on `type` from the verified body: `webhook-topic` isn't signed.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 ordinal --path /webhooks/ordinal
```
