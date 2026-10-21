# dbt Cloud Webhooks - Next.js Example

Minimal example of receiving dbt Cloud webhooks with signature verification, using the App Router.

## Prerequisites

- Node.js 18+
- dbt Cloud account (Starter or Enterprise) with a webhook and its secret token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your dbt Cloud webhook secret (`hmac_secret`) to `.env.local` as `DBT_CLOUD_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, with the webhook endpoint at `POST /webhooks/dbt-cloud`.

## Test

Run the automated tests (they generate real signatures):

```bash
npm test
```

To receive real webhooks locally, no account required:

```bash
npx hookdeck-cli listen 3000 dbt-cloud --path /webhooks/dbt-cloud
```

Use the URL it prints as the **Endpoint** of your dbt Cloud webhook (Account settings → Webhooks), then run a job.

## How Verification Works

dbt Cloud sends the lowercase hex HMAC-SHA256 of the raw body in the `Authorization` header (no `Bearer`, no prefix). The route reads `request.text()` so the signed bytes are untouched, then compares timing-safely.
