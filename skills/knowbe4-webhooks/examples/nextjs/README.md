# KnowBe4 Webhooks - Next.js Example

Minimal example of receiving KnowBe4 (KSAT and PhishER) webhooks with the App Router and
authenticating them with a secret custom header.

KnowBe4 does not sign webhooks, so there is no HMAC to verify. Add a custom header with a secret
value to the KSAT or PhishER webhook, and the route compares that header with
`KNOWBE4_WEBHOOK_SECRET` in constant time. It reads the body as raw text, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A KSAT (Platinum, Diamond or SAT Advanced) or PhishER account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `KNOWBE4_WEBHOOK_HEADER` to the name of the custom header you added (default `Authorization`)
   and `KNOWBE4_WEBHOOK_SECRET` to its exact, whole value (including any `Bearer ` prefix).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/knowbe4`.

## Test

```bash
npm test
```

No KnowBe4 account is needed. To try it by hand (the body is an illustrative payload):

```bash
curl -X POST http://localhost:3000/webhooks/knowbe4 \
  -H "Content-Type: application/json" \
  -H "Authorization: $KNOWBE4_WEBHOOK_SECRET" \
  -d '{"event_type":"Phish Failure Removed","System":"KnowBe4"}'
```

## Receive Webhooks Locally

KnowBe4 can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 knowbe4 --path /webhooks/knowbe4
```

Put the printed URL in the KSAT or PhishER webhook.

## How It Works

- `lib/verify-knowbe4.ts`: `verifyKnowbe4Request()` (case-insensitive header lookup, whole-value constant-time compare)
- `app/webhooks/knowbe4/route.ts`: the `POST` handler

Failure returns `401`; a body that isn't a JSON object returns `400`; success returns
`200 {"received": true}`. The handler reads an illustrative `event_type` string, because KnowBe4
documents no event field.
