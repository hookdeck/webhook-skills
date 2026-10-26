# Jobber Webhooks - Next.js Example

Minimal example of receiving Jobber webhooks with signature verification (App Router).

## Prerequisites

- Node.js 18+
- A Jobber app in the [Developer Center](https://developer.getjobber.com/) and its OAuth client secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Jobber app's OAuth client secret to `.env.local` as `JOBBER_CLIENT_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, webhook endpoint `POST /webhooks/jobber`.

## Test

```bash
npm test
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 jobber --path /webhooks/jobber
```

Then add the Hookdeck URL as the webhook URL for your app in the Jobber Developer Center and subscribe to topics such as `CLIENT_CREATE`.

## Notes

- The route reads `await request.text()` so the signed raw body is used, whatever the content type.
- Jobber expects a response within 1 second: acknowledge first, do heavy work in a background job.
