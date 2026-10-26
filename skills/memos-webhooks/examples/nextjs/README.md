# Memos Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving Memos webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Memos follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- A Memos instance (0.31+) with a webhook and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Memos webhook secret to `.env` as `MEMOS_WEBHOOK_SECRET`
   (the full `whsec_...` value, shown when the webhook is created and revealable in its edit dialog).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/memos
```

## Test

```bash
npm test
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), and check that the
`svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 memos --path /webhooks/memos
```

1. In Memos go to **Settings**, add a webhook with the tunnel URL, and copy its signing secret into `.env`.
   Older webhooks are unsigned until you generate a secret in the edit dialog.
2. Create or edit a memo to trigger a delivery.
3. Memos treats any response without JSON `{"code":0}` as failed; this handler returns it on success.
   If you receive through Hookdeck, set a custom response with body `{"code":0}` on the source.

## Event Handling

The body is `{ url, activityType, creator, memo }`. The handler reads the event name from the top-level
`activityType`, routes these events, and logs anything else (still answering `{"code":0}`):

- `memos.memo.created`, `memos.memo.updated`, `memos.memo.deleted`
- `memos.memo.comment.created`

There is no event id in the body: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
