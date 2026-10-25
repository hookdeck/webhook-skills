# Rocketlane Webhooks - Next.js Example

Minimal example of receiving Rocketlane webhooks and authenticating them with HTTP Basic auth.

Rocketlane does not sign payloads. The only authentication is Basic auth (a username and
password set on the webhook), sent as `Authorization: Basic base64(username:password)`. The
handler parses it strictly, splits on the first colon, and compares the username and the
password each in constant time, evaluating both before deciding. A static credential
authenticates the sender, not the body, and gives no replay protection, so use HTTPS and
rotate it if it leaks.

## Prerequisites

- Node.js 18+
- A Rocketlane account with access to Settings > Webhooks

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. In Rocketlane, choose Basic authentication and set a username and password on the Rocketlane
   webhook (see [../../references/setup.md](../../references/setup.md)). Put them in `.env` as
   `ROCKETLANE_WEBHOOK_USERNAME` and `ROCKETLANE_WEBHOOK_PASSWORD`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/rocketlane`.

## Test

```bash
npm test
```

The tests send documented `TASK_CREATED` and `TASK_UPDATED` shapes with correct, wrong,
malformed and missing credentials. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/rocketlane \
  -u "$ROCKETLANE_WEBHOOK_USERNAME:$ROCKETLANE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"eventId":"b6c68150-86f3-4a26-9a5f-66db5ca24b87","resourceType":"TASK","eventType":"TASK_CREATED","version":"1.0","data":{"task":{"taskId":278,"taskName":"task2"}}}'
```

## Receive Rocketlane Webhooks Locally

```bash
npx hookdeck-cli listen 3000 rocketlane --path /webhooks/rocketlane
```

Paste the printed URL as the webhook URL in Rocketlane. The credentials must arrive on the
first request: Hookdeck never sends a 401 + WWW-Authenticate challenge, it verifies the
request as received.

## How It Works

- `lib/verify-rocketlane.ts`: `parseBasicAuth()` and `verifyRocketlaneRequest()`
- `app/webhooks/rocketlane/route.ts`: the App Router `POST` handler

1. The credential is checked before the body is read. Failure returns `401`.
2. The body is read with `request.text()`, so any content type works, then parsed as a JSON object (`400` otherwise).
3. The handler switches on `eventType` (`TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `PROJECT_*`, `PHASE_*`).
4. It returns `200 {"received": true}`. Rocketlane counts only 200 or 204 within 10 seconds as delivered.
