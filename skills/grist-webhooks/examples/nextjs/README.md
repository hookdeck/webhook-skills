# Grist Webhooks - Next.js Example

Minimal example of receiving Grist row webhooks and authenticating them with the
`Authorization` header.

Grist does not sign payloads. The credential is the webhook's **Header Authorization** field,
a static string Grist sends verbatim as the `Authorization` header. The handler compares the
**whole header value**, including any `Bearer ` or `Basic ` prefix, with a constant-time
comparison. A static credential authenticates the sender, not the body, and gives no replay
protection, so use HTTPS and rotate it if it leaks.

## Prerequisites

- Node.js 18+
- A Grist document with a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `GRIST_AUTHORIZATION` to the Header Authorization value exactly as set in Grist,
   including any "Bearer " or "Basic " prefix.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/grist`.

## Test

```bash
npm test
```

The tests send a documented row array with correct, wrong and missing `Authorization`
headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/grist \
  -H "Content-Type: application/json" \
  -H "Authorization: $GRIST_AUTHORIZATION" \
  -d '[{"id":29,"manualSort":29,"Title":"Trophy","Price":60}]'
```

## Receive Grist Webhooks Locally

```bash
npx hookdeck-cli listen 3000 grist --path /webhooks/grist
```

Use the printed URL as the webhook **URL** in Grist (Document settings > Webhooks).

## How It Works

- `app/webhooks/grist/route.ts`: the `POST /webhooks/grist` route
- `lib/verify-grist.ts`: `verifyGristRequest()`

1. The body is read with `request.text()`, so any content type works.
2. `Authorization` is compared with `GRIST_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON array of row objects (`400` otherwise).
4. Grist payloads have no event field (the `add` / `update` event types are set in the
   webhook config), so every row is handled as an upsert keyed on `id`.
5. It returns `200 {"received": true, "rows": <count>}`.
