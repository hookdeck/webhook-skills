# FourKites Webhooks - Next.js Example

Minimal example of receiving FourKites webhooks (callbacks) in the Next.js App Router and
authenticating them with HTTP Basic auth.

FourKites does not sign callbacks, so there is no HMAC to verify. `lib/verify-fourkites.ts` parses
`Authorization: Basic base64(username:password)` and compares the username and password each in
constant time. A static shared credential authenticates the sender, not the body, and gives no
replay protection (no signature, no timestamp): use HTTPS and rotate the credential if it leaks.
The credentials must arrive on the first request; a `401` + `WWW-Authenticate` challenge flow
won't work through Hookdeck. The route reads the body as text, so any content type works.

## Prerequisites

- Node.js 18+
- A FourKites callback subscription using Basic Auth (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `FOURKITES_WEBHOOK_USERNAME` and `FOURKITES_WEBHOOK_PASSWORD` to the credentials you gave FourKites.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/fourkites`.

## Test

```bash
npm test
```

The tests send every documented `MessageType` with correct, wrong and missing credentials. No
FourKites account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/fourkites \
  -u "$FOURKITES_WEBHOOK_USERNAME:$FOURKITES_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"MessageType":"STOP_ARRIVAL","FourKitesLoadId":1234,"LoadNumber":"BOL12345"}'
```

## Receive Webhooks Locally

FourKites can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 fourkites --path /webhooks/fourkites
```

## How It Works

- `lib/verify-fourkites.ts`: `verifyFourKitesRequest()`
- `app/webhooks/fourkites/route.ts`: the `POST` handler

1. The `Authorization` header is checked before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `MessageType`: `LOAD_CREATION`, `LOCATION_UPDATE`, `TRACKING_UPDATE`,
   `STOP_ETA_UPDATED`, `STOP_ARRIVAL`, `STOP_DEPARTURE`, `STOP_AUTO_COMPLETED`,
   `MANUALLY_DELIVERED`, `MANUALLY_PICKED_UP`, `STOP_APPOINTMENT_RESCHEDULED`, `STOP_AMEND`,
   `LOAD_DELETED`.
4. It returns `200 {"received": true}`.
