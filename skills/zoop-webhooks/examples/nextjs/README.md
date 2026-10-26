# Zoop Webhooks - Next.js Example

Minimal example of receiving Zoop webhooks and authenticating them with the `Authorization` header.

Zoop does not sign payloads. You set an `authorization` string when you create the webhook
through the Zoop API, and Zoop sends it back verbatim in the `Authorization` header. The handler
compares the **whole header value** with a constant-time comparison, answers the `ping`
validation event with `200`, acknowledges every event before processing it (Zoop waits 1 second)
and dedupes on the event `id`.

## Prerequisites

- Node.js 20+
- A Zoop marketplace. Create the webhook with an `authorization` value (see
  [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ZOOP_AUTHORIZATION` to the exact `authorization` string you gave Zoop.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/zoop`.

## Test

```bash
npm test
```

The tests send the documented `ping` and event bodies with correct, wrong and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/zoop \
  -H "Content-Type: application/json" \
  -H "Authorization: $ZOOP_AUTHORIZATION" \
  -d '{"id":"evt_1","resource":"event","type":"transaction.succeeded","payload":{"object":{"id":"tx_1"}}}'
```

## Receive Zoop Webhooks Locally

```bash
npx hookdeck-cli listen 3000 zoop --path /webhooks/zoop
```

Use the printed URL as the webhook `url` when you create the webhook.

## How It Works

- `lib/zoop.ts`: `verifyZoopRequest()` and `processEvent()`; `app/webhooks/zoop/route.ts`: the `POST` handler

1. The body is read as raw text (`request.text()`), so any content type works.
2. `Authorization` is compared with `ZOOP_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object with a string `type` (`400` otherwise).
4. The handler returns `200 {"received": true}` immediately, then processes the event.
5. `processEvent` dedupes on `id` and dispatches on `type` (`ping`, `transaction.succeeded`,
   `transaction.failed`, `transaction.canceled`, `seller.activated`, `bank_account.associated`).

A static credential authenticates the sender, not the body, and gives no replay protection: use
HTTPS and rotate the value if it leaks.
