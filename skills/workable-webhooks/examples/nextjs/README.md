# Workable Webhooks - Next.js Example

Minimal example of receiving Workable webhooks with signature verification, using the App Router.

## Prerequisites

- Node.js 18+
- A Workable account with an API token (or an OAuth application secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `WORKABLE_SIGNING_KEY` to the API token that created the subscription (or your OAuth application secret). Workable has no separate webhook secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 workable --path /webhooks/workable
```

Use the URL it prints as the `target` when creating the Workable subscription.

## Notes

- The route reads the raw body with `request.text()` so verification works for any content type.
- The signature is HMAC-SHA256 of the raw body as lowercase hex. Workable's docs don't state the encoding; hex matches the n8n and Botpress integrations.

## Test

```bash
npm test
```
