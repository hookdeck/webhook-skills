# Egnyte Webhooks - Express Example

Minimal example of receiving Egnyte webhooks and authenticating them with the `Authorization`
header.

Egnyte does not sign payloads. It sends the `authHeader` you set when registering the webhook
as the `Authorization` header. The handler compares the **whole header value**, including any
`Bearer ` prefix, with a constant-time comparison. A static credential authenticates the sender,
not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

## Prerequisites

- Node.js 18+
- An Egnyte domain and a webhook registered with an `authHeader` (see
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

3. Set `EGNYTE_AUTHORIZATION` to the full `authHeader` value, e.g. `Bearer secret-token-12345`.
   Paste the authHeader value exactly as set on the Egnyte webhook, including any "Bearer " prefix.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/egnyte`.

## Test

```bash
npm test
```

The tests send Egnyte's documented `{"data": [...]}` shape with correct, wrong and missing
`Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/egnyte \
  -H "Content-Type: application/json" \
  -H "Authorization: $EGNYTE_AUTHORIZATION" \
  -d '{"data":[{"eventId":"evt-1","eventType":"fs:add_file","data":{"targetPath":"/Shared/a.txt"}}]}'
```

## Receive Egnyte Webhooks Locally

```bash
npx hookdeck-cli listen 3000 egnyte --path /webhooks/egnyte
```

Register the printed URL as the webhook `url`.

## How It Works

- `src/index.js`: `verifyEgnyteRequest()` plus the `POST /webhooks/egnyte` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared with `EGNYTE_AUTHORIZATION`. Failure returns `401`.
3. The body must be `{"data": [...]}` (`400` otherwise).
4. The handler loops over `data[]` and dispatches on `eventType`.
5. It returns exactly `200 {"received": true}`; Egnyte retries on any other status and
   eventually disables the webhook.
