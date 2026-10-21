# AppsFlyer Webhooks - Express Example

Minimal example of receiving AppsFlyer Push API (raw data) webhooks and
authenticating the custom authorization header. AppsFlyer doesn't sign
payloads, so this example compares the header value in constant time.

## Prerequisites

- Node.js 18+
- An AppsFlyer app with Push API configured using the **POST** method and a
  custom authorization header

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `APPSFLYER_AUTH_TOKEN` to the header value you configured in AppsFlyer
   and, if it isn't `Authorization`, `APPSFLYER_AUTH_HEADER_NAME`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/appsflyer`.

## Test

```bash
npm test
```

The tests cover the correct token, a custom header name, a wrong or
different-length token, a missing header, an unconfigured server, invalid JSON
and event dispatch.

Send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/appsflyer \
  -H "Authorization: $APPSFLYER_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_name":"install","appsflyer_id":"1700000000000-1234567","app_id":"id123456789","event_time":"2026-10-21 09:30:00"}'
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 appsflyer --path /webhooks/appsflyer
```

No account required. Paste the printed HTTPS URL as the Push API endpoint in
AppsFlyer.

## Notes

- The handler is in `src/index.js`.
- There's no signature or timestamp, so deduplicate on `appsflyer_id` +
  `event_name` + `event_time`.
- See [../../references/verification.md](../../references/verification.md).
