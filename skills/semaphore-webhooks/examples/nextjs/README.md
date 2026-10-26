# Semaphore CI Webhooks - Next.js Example

Minimal example of receiving Semaphore CI notification webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- A Semaphore notification with a webhook secret (see [references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the `WEBHOOK_SECRET` value of the organization secret named on the notification into `.env.local` as `SEMAPHORE_WEBHOOK_SECRET`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts GET, POST, PUT, PATCH and DELETE on `/webhooks/semaphore`.

## Test

```bash
npm test
```

To receive real notifications locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 semaphore --path /webhooks/semaphore
```
