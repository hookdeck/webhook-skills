# Flux CD Webhooks - Next.js Example

Minimal example of receiving Flux CD webhooks with signature verification (`X-Signature`, HMAC-SHA256 over the raw body) in the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Flux cluster with a notification-controller `Provider` of type `generic-hmac`, and the `token` from its Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the Secret's `token` value to `.env.local` as `FLUX_CD_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/flux-cd`.

The route reads the raw bytes with `await request.arrayBuffer()` and parses the JSON only after the signature check.

## Test

Run the unit tests (they generate real signatures):

```bash
npm test
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 flux-cd --path /webhooks/flux-cd
```

Then set the Hookdeck URL as the Provider's `spec.address` (see the skill's `references/setup.md`). A Provider of type `generic` is unsigned and fails verification; use `generic-hmac`.
