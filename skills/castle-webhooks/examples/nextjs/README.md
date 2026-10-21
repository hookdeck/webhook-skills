# Castle Webhooks - Next.js Example

Minimal example of receiving Castle webhooks with `X-Castle-Signature` verification (base64 HMAC-SHA256 of the raw body, keyed with your API secret) using the App Router.

## Prerequisites

- Node.js 18+
- Castle account with your API secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Castle API secret to `.env.local` as `CASTLE_API_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The webhook endpoint is `POST /webhooks/castle`.

## Test

```bash
npm test
```

To receive real webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 castle --path /webhooks/castle
```

Use the Hookdeck URL as the webhook endpoint in Castle's dashboard (Policy or Lists → Integrations → Add Integration).

## Events handled

`$policy.matched`, `$list_item.created`, `$list_item.archived`, `$list_item.unarchived`
