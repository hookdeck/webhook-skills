# Reditus Webhooks - Next.js Example

Minimal example of receiving Reditus webhooks with `X-Signature` verification (hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A Reditus webhook secret (the docs don't say where it is shown; see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `REDITUS_WEBHOOK_SECRET` in `.env`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and serves `/webhooks/reditus` for GET, POST, PUT, PATCH and DELETE (Reditus's docs don't name the method).

## Test

```bash
npm test
```

The tests sign payloads with the real algorithm and cover valid, missing, wrong, malformed and prefixed signatures, exact-bytes verification, every method, body-less GET, any content type, the five documented events and wrong-typed fields. No Reditus account is needed.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 reditus --path /webhooks/reditus
```

Use the printed URL as the endpoint in Reditus. Hookdeck's Reditus source pre-selects POST without managing the method, so allow any other method Reditus uses on the source.

## How It Works

- `lib/verify-reditus.ts`: `verifyReditusSignature()`
- `app/webhooks/reditus/route.ts`: `POST`, `PUT`, `PATCH`, `GET` and `DELETE` exports

1. The raw body bytes are read (`request.arrayBuffer()`) and the `X-Signature` header is verified first: exactly 64 hex characters, then a constant-time compare against the hex HMAC-SHA256. Failure returns `401`.
2. A verified request with no body is acknowledged with `200`.
3. Otherwise the body must be a JSON object (`400` if not). Fields are type-checked before use.
4. The handler dispatches on `event_type`: `partnership.accepted`, `referral.created`, `advocate.created`, `lead.created`, `reward.created`. Others are logged.
5. It returns `200 {"received": true}`.
