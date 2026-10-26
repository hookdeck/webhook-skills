# Teamwork Webhooks - Next.js Example

Minimal example of receiving Teamwork.com Projects (Version 2) webhooks with `X-Projects-Signature` verification, using the App Router.

## Prerequisites

- Node.js 18+
- A Teamwork **Version 2** webhook with a **token** set (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the webhook token to `.env.local` as `TEAMWORK_WEBHOOK_TOKEN`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Unit tests

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 teamwork --path /webhooks/teamwork
```

Use the Hookdeck URL as the webhook URL in Teamwork, then create or complete a task.

## Endpoint

- `POST /webhooks/teamwork` - Receives and verifies Teamwork webhook events (`app/webhooks/teamwork/route.ts`). The raw body is read with `request.text()`. Returns `401` on a missing or invalid signature.
