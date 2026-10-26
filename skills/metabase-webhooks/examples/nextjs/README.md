# Metabase Webhooks - Next.js Example

Minimal example of receiving Metabase alert webhooks (App Router), authenticating the HTTP Basic credentials.

Metabase does not sign webhooks. Choose **Basic** authentication on the webhook and the request carries `Authorization: Basic base64(username:password)`.

## Prerequisites

- Node.js 18+
- A Metabase webhook (Admin > Settings > Webhooks) using Basic authentication

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the username and password you set on the Metabase webhook in `.env.local`
   (`METABASE_WEBHOOK_USERNAME`, `METABASE_WEBHOOK_PASSWORD`).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The endpoint is `POST /webhooks/metabase`.

## Test

```bash
npm test
```

To receive real alerts locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 metabase --path /webhooks/metabase
```

Use the printed URL as the webhook URL in Metabase, then send a test alert.

## Notes

- A static shared credential authenticates the sender, not the body, and gives no replay protection. Use HTTPS and rotate the credential if it leaks.
- The handler reads `request.text()` and parses JSON only after the credential check, so any content type works.
- Alerts embed a base64 PNG and can be large; check your host's request body limit.
