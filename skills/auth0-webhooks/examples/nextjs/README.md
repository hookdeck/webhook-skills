# Auth0 Webhooks - Next.js Example

Minimal example of receiving Auth0 **Custom Log Stream** events with the Next.js
App Router and validating the configured Authorization token.

## Prerequisites

- Node.js 18+
- An Auth0 tenant with a **Custom Log Stream (Webhook)** — see
  [../../references/setup.md](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AUTH0_LOG_STREAM_TOKEN` in `.env` to the same value you configured as the
   log stream's **Authorization Token** in the Auth0 Dashboard.

## Run

```bash
npm run dev
```

The webhook route is served at `POST http://localhost:3000/webhooks/auth0`
(handled by `app/webhooks/auth0/route.ts`).

## Test

```bash
npm test
```

## Receive Real Events Locally

Use the Hookdeck CLI to tunnel Auth0 events to your local server — no account,
no install:

```bash
npx hookdeck-cli listen 3000 auth0 --path /webhooks/auth0
```

Use the printed URL as the **Payload URL** of your Auth0 log stream.

## How It Works

1. Auth0 batches log events and `POST`s them as a **JSON array**.
2. The route compares the `Authorization` header to `AUTH0_LOG_STREAM_TOKEN`
   with a timing-safe comparison (`401` if it doesn't match).
3. It processes each record by its `data.type` code and returns `200` (Auth0
   retries on non-`2xx`).
