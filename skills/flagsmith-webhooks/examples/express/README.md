# Flagsmith Webhooks - Express Example

Minimal example of receiving Flagsmith webhooks (environment, audit log and identity) with `X-Flagsmith-Signature` verification.

## Prerequisites

- Node.js 18+
- A Flagsmith project (Flagsmith Cloud or self-hosted) where you can add a webhook with a secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the same value you enter in Flagsmith's **Secret** field into `.env` as `FLAGSMITH_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 flagsmith --path /webhooks/flagsmith
```

Paste the Hookdeck URL into the webhook URL field in Flagsmith, then change a flag's state to trigger a `FLAG_UPDATED` event.

### Run Unit Tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/flagsmith` — reads the raw body with `express.raw({ type: '*/*' })`, verifies `X-Flagsmith-Signature` (hex HMAC-SHA256 of the raw body), and handles `FLAG_UPDATED`, `FLAG_DELETED`, `AUDIT_LOG_CREATED` and identity payloads.
