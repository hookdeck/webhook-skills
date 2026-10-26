# RapidAPI Webhooks - Next.js Example

Minimal example of receiving RapidAPI Enterprise Hub events with the Next.js App Router and
authenticating them with the `x-rapidapi-webhook-secret` header.

Covers Enterprise Hub events only. RapidAPI does not sign payloads, so there is no HMAC to
verify. The route compares the whole `x-rapidapi-webhook-secret` header value with your webhook
secret key in constant time, then reads the body as text (any content type works) and parses it.

## Prerequisites

- Node.js 18+
- A RapidAPI Enterprise Hub with events enabled (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `RAPIDAPI_WEBHOOK_SECRET` to the secret key shown on the **Events** tab of the Admin Panel.
4. Optional: set `RAPIDAPI_EVENT_FIELD` to the body field that holds the event type, once you have
   seen a sample from **Test event** (the body format isn't documented).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/rapidapi`.

## Test

```bash
npm test
```

The tests send events with correct, wrong and missing secrets. Example payloads are
illustrative. No RapidAPI account is needed.

## Receive Webhooks Locally

RapidAPI can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 rapidapi --path /webhooks/rapidapi
```

Add the printed URL as a callback URL on the Events tab.

## How It Works

- `lib/verify-rapidapi.ts`: `verifyRapidApiRequest()`
- `app/webhooks/rapidapi/route.ts`: the `POST` handler

1. The header is checked before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the field named by `RAPIDAPI_EVENT_FIELD`: `API Created`,
   `API Updated`, `API Deleted`, `Subscription Created`, `Subscription Updated`, `User Created`,
   `Billing Plan Updated`. Other events are acknowledged.
4. It returns `200 {"received": true}`.

A static shared secret authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the key (**Generate new**) if it leaks.
