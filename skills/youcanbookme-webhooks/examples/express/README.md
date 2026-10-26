# YouCanBookMe Webhooks - Express Example

Minimal example of receiving YouCanBookMe webhooks and authenticating them with a secret request
header.

YouCanBookMe does not sign payloads, so there is no HMAC to verify. You add a Request Header
key/value to the webhook action; the handler compares that header with your stored value (the whole
value, constant time). A static credential authenticates the sender, not the body, and gives no
replay protection, so use HTTPS. The route accepts `POST`, `PUT`, `PATCH`, `DELETE` and `GET`
(the method is your choice in YouCanBookMe), tolerates an empty body, and reads the body with
`express.raw({ type: '*/*' })` so any content type works.

## Prerequisites

- Node.js 18+
- A YouCanBookMe webhook action with a secret request header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `YOUCANBOOKME_WEBHOOK_HEADER` to the header name you added (default `Authorization`) and
   `YOUCANBOOKME_WEBHOOK_SECRET` to the exact, whole header value (including any `Bearer ` prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and serves `/webhooks/youcanbookme`.

## Test

```bash
npm test
```

The tests cover correct, wrong and missing headers, every method, empty bodies and each event. No
YouCanBookMe account is needed.

By hand:

```bash
curl -X POST http://localhost:3000/webhooks/youcanbookme \
  -H "Content-Type: application/json" \
  -H "Authorization: $YOUCANBOOKME_WEBHOOK_SECRET" \
  -d '{"event":"booking_made","email":"jane@example.com"}'
```

## Receive Webhooks Locally

YouCanBookMe can't reach `localhost`. Tunnel with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 youcanbookme --path /webhooks/youcanbookme
```

## How It Works

- `src/index.js`: `verifyYoucanbookmeRequest()` plus the `/webhooks/youcanbookme` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. An empty body returns `200`; otherwise the body must be a JSON object (`400` if not).
3. The handler dispatches on your template's `event` field (illustrative values): `booking_made`,
   `booking_rescheduled`, `booking_cancelled`, `reminder`, `follow_up`, `no_show`.
4. It returns `200 {"received": true}`.
