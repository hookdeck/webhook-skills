# Todoist Webhooks - Next.js Example

Minimal example of receiving Todoist webhooks with signature verification using the App Router.

## Prerequisites

- Node.js 18+
- A Todoist app (App Management Console) with its Client Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your app's **Client Secret** to `.env.local` as `TODOIST_CLIENT_SECRET` (Todoist signs webhooks with it; there is no separate webhook secret)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 todoist --path /webhooks/todoist
```

Set the Hookdeck URL as the webhook callback URL in the App Management Console (HTTPS, no port). Remember to complete the OAuth flow with your own account so events fire for you.

## Endpoint

- `POST /webhooks/todoist` - Verifies `X-Todoist-Hmac-SHA256` against the raw body (`request.text()`), dedupes on `X-Todoist-Delivery-ID`, and handles events. Verification lives in `lib/todoist.ts`.
