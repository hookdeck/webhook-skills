# Castle Webhooks - Express Example

Minimal example of receiving Castle webhooks with `X-Castle-Signature` verification (base64 HMAC-SHA256 of the raw body, keyed with your API secret).

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
   cp .env.example .env
   ```

3. Add your Castle API secret to `.env` as `CASTLE_API_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the automated tests:

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
