# Rebrandly Webhooks - Next.js Example

Minimal App Router example of receiving Rebrandly webhooks (Clickstream click batches) and
authenticating them with a shared header.

Rebrandly webhooks are not signed. The route reads the header named by `REBRANDLY_WEBHOOK_HEADER`
(default `Authorization`) and compares its whole value with `REBRANDLY_WEBHOOK_SECRET` in
constant time. It exports a handler for GET, POST, PUT, PATCH and DELETE, checks the credential
before reading the body, and handles an empty body.

## Prerequisites

- Node.js 18+
- A Rebrandly Clickstream webhook or account webhook with an authentication header

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `REBRANDLY_WEBHOOK_HEADER` to the header name you gave Rebrandly and
   `REBRANDLY_WEBHOOK_SECRET` to its exact value (including any `Bearer ` prefix).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and handles any method at `/webhooks/rebrandly`.

## Test

```bash
npm test
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 rebrandly --path /webhooks/rebrandly
```

## How It Works

- `lib/verify-rebrandly.ts`: `verifyRebrandlyRequest()`, a constant-time whole-value header check
- `app/webhooks/rebrandly/route.ts`: one handler exported for each method

Failure returns `401`; invalid JSON returns `400`; success returns `200 {"received": true, "clicks": n}`.
