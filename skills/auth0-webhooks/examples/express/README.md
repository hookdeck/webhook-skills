# Auth0 Webhooks - Express Example

Minimal example of receiving Auth0 **Event Streams** events with Express and
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
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at
`POST /webhooks/auth0`.

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
3. It responds `204` straight away, then handles the event by its `type`.
