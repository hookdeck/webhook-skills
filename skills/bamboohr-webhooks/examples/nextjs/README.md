# BambooHR Webhooks - Next.js Example

Minimal example of receiving BambooHR employee webhooks with `X-BambooHR-Signature` verification.

## Prerequisites

- Node.js 18+
- A BambooHR Global or Permissioned webhook and its private key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook's private key to `.env` as `BAMBOOHR_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real HMAC-SHA256 signatures over body + timestamp):

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 bamboohr --path /webhooks/bamboohr
```

Use the Hookdeck URL as the webhook URL in BambooHR (HTTPS is required).

## Endpoint

- `POST /webhooks/bamboohr` - reads the raw bytes (`await request.arrayBuffer()`), verifies `X-BambooHR-Signature` against the body followed by `X-BambooHR-Timestamp`, then handles Event-Based payloads by `type` (`employee.created`, `employee.updated`, `employee.deleted`, `company.*`) and Field-Based payloads by looping over `employees` (`Created`, `Updated` and `Deleted` actions). Invalid signatures get `401`.

Set `BAMBOOHR_WEBHOOK_TOLERANCE_SECONDS` to opt in to a timestamp window (off by default).
