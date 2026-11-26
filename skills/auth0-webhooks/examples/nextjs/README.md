# Auth0 Webhooks - Next.js Example

Minimal example of receiving Auth0 **Event Streams** events with the Next.js
App Router and
checking the bearer Authorization header.

## Prerequisites

- Node.js 18+
- An Auth0 event stream with a webhook destination and bearer authorization.
  See [../../references/setup.md](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AUTH0_EVENT_STREAM_TOKEN` in `.env` to the token you set as the
   stream's bearer authorization.

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

Use the Hookdeck CLI to tunnel Auth0 events to your local server, with no
account and no install:

```bash
npx hookdeck-cli listen 3000 auth0 --path /webhooks/auth0
```

Use the printed URL as the event stream's webhook endpoint, then create a test
user to trigger `user.created`.

## How It Works

1. Auth0 `POST`s one CloudEvents-shaped JSON object per event.
2. The handler compares the `Authorization` header with
   `Bearer <AUTH0_EVENT_STREAM_TOKEN>` using a timing-safe comparison (`401` if
   it doesn't match).
3. It handles the event by its `type` and returns `204`. Hand slow work to a
   queue, because Auth0 retries only after 1s, 2s and 4s.
