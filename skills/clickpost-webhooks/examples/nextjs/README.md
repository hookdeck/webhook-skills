# ClickPost Webhooks - Next.js Example

Minimal example of receiving ClickPost shipment status webhooks and authenticating them with
`Authorization: Token <secret>`.

ClickPost does not sign payloads. The handler checks the `Token` scheme (case-insensitively) and
compares the rest with your token in constant time in an App Router route handler (`app/webhooks/clickpost/route.ts`). It then dispatches on
`clickpost_status_code` and dedupes on waybill + scan.

## Prerequisites

- Node.js 18+
- A ClickPost account (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CLICKPOST_WEBHOOK_SECRET` to the bare token (without `Token `).

   Choose Simple Token authentication on the ClickPost webhook and paste the token.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/clickpost`.

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 clickpost --path /webhooks/clickpost
```

Or send one by hand:

```bash
curl -X POST http://localhost:3000/webhooks/clickpost \
  -H "Content-Type: application/json" \
  -H "Authorization: Token $CLICKPOST_WEBHOOK_SECRET" \
  -d '{"waybill":"TEST-AWB-HLD-123","cp_id":10001,"timestamp":"2024-11-19T10:04:20Z","clickpost_status_code":8,"clickpost_status_description":"Delivered"}'
```
