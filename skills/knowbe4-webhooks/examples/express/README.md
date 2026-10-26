# KnowBe4 Webhooks - Express Example

Minimal example of receiving KnowBe4 (KSAT and PhishER) webhooks and authenticating them with a
secret custom header.

KnowBe4 does not sign webhooks, so there is no HMAC to verify. Add a custom header with a secret
value to the KSAT or PhishER webhook, and the handler compares that header with
`KNOWBE4_WEBHOOK_SECRET` in constant time. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works.

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
   cp .env.example .env
   ```

3. Set `KNOWBE4_WEBHOOK_HEADER` to the name of the custom header you added (default `Authorization`)
   and `KNOWBE4_WEBHOOK_SECRET` to its exact, whole value (including any `Bearer ` prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/knowbe4`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and prefix-stripped values, case-insensitive header
lookup and any content type. No KnowBe4 account is needed.

To try it by hand (the body is an illustrative payload):

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

- `src/index.js`: `verifyKnowbe4Request()` plus the `POST /webhooks/knowbe4` route

1. The configured header is looked up case-insensitively and its whole value compared with the
   secret before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler reads an illustrative `event_type` string (KnowBe4 documents no event field) and
   logs anything it doesn't recognise.
4. It returns `200 {"received": true}`.
