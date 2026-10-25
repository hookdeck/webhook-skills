# YouMail Webhooks - Express Example

Minimal example of receiving YouMail Protective Services webhooks and authenticating them
with the `Authorization` header.

YouMail does not sign payloads. A webhook created with the **Bearer** auth scheme is expected to
send `Authorization: Bearer <token>` (YouMail doesn't print the header; if deliveries are
rejected, capture one and set the expected value exactly as received). The handler compares the **whole header value**, including
the `Bearer ` prefix, with a constant-time comparison. Basic auth is not covered.

> Choose the Bearer auth scheme on the YouMail webhook, not Basic, and paste the whole Authorization value, including "Bearer ".

A static credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A YouMail Protective Services API account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `YOUMAIL_AUTHORIZATION` to the full header value, e.g. `Bearer <token>`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/youmail`.

## Test

```bash
npm test
```

The tests send each documented payload shape with correct, wrong, Basic and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/youmail \
  -H "Content-Type: application/json" \
  -H "Authorization: $YOUMAIL_AUTHORIZATION" \
  -d '{"callEvents":[{"callEventUuid":"a1b2c3","callResult":"BLOCKED"}]}'
```

## Receive YouMail Webhooks Locally

```bash
npx hookdeck-cli listen 3000 youmail --path /webhooks/youmail
```

Use the printed URL as the webhook `url` (YouMail requires https).

## How It Works

- `src/index.js`: `verifyYouMailRequest()` plus the `POST /webhooks/youmail` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared in full with `YOUMAIL_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. Payloads have no type field, so the handler detects the kind by top-level keys (`callEvents`,
   `*Summaries`, `tnReportUuid`, `phoneNumber` with score fields). Better: one URL per webhook.
5. It returns `200 {"received": true}`.
