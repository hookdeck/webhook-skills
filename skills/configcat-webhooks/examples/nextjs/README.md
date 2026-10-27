# ConfigCat Webhooks - Next.js Example

Minimal example of receiving ConfigCat webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- A ConfigCat account with a webhook and its signing key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your ConfigCat signing key to `.env.local` as `CONFIGCAT_WEBHOOK_SECRET`, pasted **whole** including the `configcat_whsk_` prefix. Keep a single signing key on the webhook: with two keys ConfigCat sends two signatures and verification fails.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The route is `/webhooks/configcat` and accepts GET, POST, PUT, PATCH and DELETE (ConfigCat webhooks use GET or POST, set per webhook).

## Test

```bash
npm test
```

The tests sign requests with the same algorithm as ConfigCat (including the vector from ConfigCat's docs).

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 configcat --path /webhooks/configcat
```

Then use the printed URL as the webhook URL in ConfigCat. If the webhook uses GET, also allow GET on the Hookdeck source.

## Files

- `app/webhooks/configcat/route.ts` - Route handler (verifies, then parses)
- `lib/verify.ts` - Signature verification
- `test/webhook.test.ts` - Tests
