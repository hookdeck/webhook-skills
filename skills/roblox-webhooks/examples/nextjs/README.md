# Roblox Webhooks - Next.js Example

Minimal Next.js example of receiving [Roblox](https://create.roblox.com/docs/cloud/webhooks/webhook-notifications) webhook notifications and verifying the `roblox-signature` header (base64 HMAC-SHA256 of `<t>.<raw body>`).

## Prerequisites

- Node.js 18+
- A Roblox experience you own (or a group experience where you're the group owner)
- A webhook configured in the Creator Dashboard **with a secret** (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ROBLOX_WEBHOOK_SECRET` in `.env` to the secret you typed into the webhook in the Creator Dashboard.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/roblox` in [app/webhooks/roblox/route.ts](app/webhooks/roblox/route.ts) (verification in [lib/verify-roblox.ts](lib/verify-roblox.ts), routing and the erasure worker in [lib/notifications.ts](lib/notifications.ts)).

## Test

```bash
npm test
```

The tests sign payloads the way Roblox does and cover: `RightToErasureRequest` (queued, not processed inline), `SampleNotification`, `AnalyticsAlert`, an unknown `EventType` (still 2xx), header members in any order, duplicate `NotificationId`, a missing header, a header with `t=` but no `v1=`, a wrong secret, a tampered or re-serialised body, a hex digest, expired, future and millisecond timestamps, a configurable tolerance, invalid JSON and an unset secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 roblox --path /webhooks/roblox
```

Paste the printed HTTPS URL into the webhook in the Creator Dashboard (**Configurations** → **Webhooks**), set a secret, and click **Test Response**. Roblox sends a signed `SampleNotification`.

## Notes

- The route reads `request.arrayBuffer()` and verifies those bytes before parsing. Don't call `request.json()` first. It runs on the Node.js runtime (`node:crypto`).
- A header with only `t=<timestamp>` means the webhook has no secret. The handler rejects it with 401 rather than skipping verification.
- Roblox needs a 2xx within 5 seconds and stops retrying after 5 failed attempts, then treats the URL as invalid. `jobQueue.enqueue` is an in-process stand-in (`setImmediate`). On serverless hosts the function can be frozen once the response is sent, so use a durable queue (SQS, QStash, Cloud Tasks) in production.
- Deduplication uses an in-memory set of `NotificationId`s. Use a database unique constraint or Redis in production.
- Only `RightToErasureRequest`, `SampleNotification` and `AnalyticsAlert` have published `EventType` values. Subscription, Commerce, Transaction Refunded and Early Harm Detection notifications fall through to the logged default branch until you add a case for the `EventType` you observe.
