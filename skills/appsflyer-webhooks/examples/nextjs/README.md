# AppsFlyer Webhooks - Next.js Example

Minimal example of receiving AppsFlyer Push API (raw data) webhooks with the
Next.js App Router and authenticating the custom authorization header.
AppsFlyer doesn't sign payloads, so the route compares the header value in
constant time.

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
   cp .env.example .env.local
   ```

3. Set `APPSFLYER_AUTH_TOKEN` to the header value you configured in AppsFlyer
   and, if it isn't `Authorization`, `APPSFLYER_AUTH_HEADER_NAME`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/appsflyer`.

## Test

```bash
npm test
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 appsflyer --path /webhooks/appsflyer
```

No account required. Paste the printed HTTPS URL as the Push API endpoint in
AppsFlyer.

## Notes

- The route is `app/webhooks/appsflyer/route.ts`.
- There's no signature or timestamp, so deduplicate on `appsflyer_id` +
  `event_name` + `event_time`.
- See [../../references/verification.md](../../references/verification.md).
