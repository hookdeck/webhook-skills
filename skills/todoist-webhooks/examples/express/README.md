# Todoist Webhooks - Express Example

Minimal example of receiving Todoist webhooks with signature verification.

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
   cp .env.example .env
   ```

3. Add your app's **Client Secret** to `.env` as `TODOIST_CLIENT_SECRET` (Todoist signs webhooks with it; there is no separate webhook secret)

## Run

```bash
npm start
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

- `POST /webhooks/todoist` - Verifies `X-Todoist-Hmac-SHA256`, dedupes on `X-Todoist-Delivery-ID`, and handles events. The raw body is read with `express.raw({ type: '*/*' })` so any content type verifies.
