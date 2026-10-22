# Unit Webhooks - Next.js Example

Minimal example of receiving Unit webhooks with `X-Unit-Signature` (HMAC-SHA1) verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Unit webhook with a `token`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `UNIT_WEBHOOK_TOKEN` in `.env.local` to the token you set on the Unit webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 unit --path /webhooks/unit
```

Use the public URL the CLI prints as the webhook `url` in Unit.

## Endpoint

- `POST /webhooks/unit` - verifies `X-Unit-Signature` over the raw body (any content type), then handles each event in `data`
