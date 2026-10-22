# Recruitee Webhooks - Next.js Example

Minimal example of receiving Recruitee webhooks with signature verification using the App Router.

## Prerequisites

- Node.js 18+
- Recruitee account with a webhook secret (Settings > Apps and Plugins > Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Recruitee webhook secret to `.env.local` as `RECRUITEE_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The endpoint is `POST /webhooks/recruitee`.

## Test

Run the automated tests (they sign payloads with the same HMAC-SHA256 scheme, and include the test vector from the Recruitee docs):

```bash
npm test
```

To receive real webhooks locally, run the Hookdeck CLI in another terminal:

```bash
npx hookdeck-cli listen 3000 recruitee --path /webhooks/recruitee
```

Then use the Hookdeck URL as the **POST URL** in Recruitee and click **Verify and create**.

## Notes

- The route reads the body with `request.text()` so the raw bytes are verified.
- The `{"test":true}` request sent on **Verify and create** gets a 200.
- Recruitee treats any status other than 200 as a failed delivery and retries.
