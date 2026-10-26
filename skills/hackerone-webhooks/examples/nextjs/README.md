# HackerOne Webhooks - Next.js Example

Minimal example of receiving HackerOne webhooks with the App Router and verifying the `X-H1-Signature` header (`sha256=` + hex HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A HackerOne program webhook with a secret set (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `HACKERONE_WEBHOOK_SECRET` to the secret you set on the HackerOne webhook.

Set a secret on the HackerOne webhook and paste it here. Without one, HackerOne signs with an empty key, which this source cannot verify.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/hackerone`.

## Test

```bash
npm test
```

The tests generate real signatures with HMAC-SHA256 and cover valid, bare-digest, tampered, malformed, missing and empty-key signatures, plus wrong-typed payload fields.

## Receive HackerOne Webhooks Locally

```bash
npx hookdeck-cli listen 3000 hackerone --path /webhooks/hackerone
```

Use the printed URL as the webhook URL in HackerOne.

## How It Works

- `lib/verify-hackerone.ts`: `verifyHackerOne()` (prefix stripped, 64 hex characters validated, constant-time compare)
- `app/webhooks/hackerone/route.ts`: the `POST` route

1. The raw bytes are read with `await request.arrayBuffer()` and verified before anything is parsed. Failure returns `401`; an unset secret returns `500`.
2. The event name comes from the `X-H1-Event` header (`400` if missing).
3. The JSON body must be an object (`400` otherwise); nested fields are type-checked before use.
4. The handler switches on the event: `report_created`, `report_new`, `report_triaged`, `report_bounty_awarded`, `report_comment_created`, `report_resolved`, `report_closed_as_*`. Others are logged.
