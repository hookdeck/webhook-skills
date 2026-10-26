# OneLogin Webhooks - Next.js Example

Minimal example of receiving OneLogin Event Broadcaster webhooks and authenticating them with a secret custom header.

OneLogin does not sign payloads, so there is no HMAC to verify. The handler compares the custom header you configured on the broadcaster with your stored secret (whole value, constant-time). A static shared credential authenticates the sender, not the body, and gives no replay protection: use HTTPS and rotate it if it leaks. The route reads the body with `request.text()`, so any content type works.

## Prerequisites

- Node.js 18+
- A OneLogin admin account with access to **Developers > Webhooks** (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ONELOGIN_WEBHOOK_HEADER` to the custom header name you add in the Event Broadcaster (default `Authorization`) and `ONELOGIN_WEBHOOK_SECRET` to the exact header value, including any `Bearer ` prefix.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/onelogin`.

## Test

```bash
npm test
```

The tests send events with correct, wrong and missing headers, JSON array bodies, and every documented `event_type_id`. No OneLogin account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/onelogin \
  -H "Content-Type: application/json" \
  -H "$ONELOGIN_WEBHOOK_HEADER: $ONELOGIN_WEBHOOK_SECRET" \
  -d '[{"event_type_id":5,"user_id":1,"user_name":"Test User","ipaddr":"203.0.113.1"}]'
```

## Receive Webhooks Locally

OneLogin can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 onelogin --path /webhooks/onelogin
```

Put the printed URL in the Event Broadcaster.

## How It Works

- `lib/verify-onelogin.ts`: header check and event parsing; `app/webhooks/onelogin/route.ts`: the App Router handler`

1. The custom header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON array of events (the recommended JSON Array format type); otherwise `400`.
3. Each event is dispatched on `event_type_id`: `5` login success, `6` login failed, `7` logout, `8` logged into an app, `11` changed password, `22` added an MFA device. Unknown IDs are acknowledged.
4. It returns `200`. OneLogin retries non-200 responses up to 3 attempts in total.
