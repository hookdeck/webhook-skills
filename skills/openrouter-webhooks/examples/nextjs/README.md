# OpenRouter Webhooks - Next.js Example

Minimal example of receiving OpenRouter video-generation callbacks (`callback_url`) with signature verification in a Next.js App Router route handler. OpenRouter has no webhook verification SDK, so the HMAC check is manual.

## Prerequisites

- Node.js 20+
- OpenRouter workspace with a webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your OpenRouter webhook signing secret to `.env.local` as `OPENROUTER_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Run the tests

```bash
npm test
```

The tests sign payloads with the real OpenRouter algorithm (HMAC-SHA256 of `"<t>,<raw body>"`) and cover valid, invalid, tampered, replayed and opt-in-tolerance requests.

### Receive real callbacks locally

```bash
npx hookdeck-cli listen 3000 openrouter --path /webhooks/openrouter
```

Use the public URL the CLI prints as the `callback_url` of a `POST /api/v1/videos` request (this spends credits).

## Endpoint

- `POST /webhooks/openrouter` - Receives and verifies OpenRouter video-generation callbacks (204 / 401)
