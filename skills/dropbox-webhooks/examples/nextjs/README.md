# Dropbox Webhooks - Next.js Example

Minimal example of receiving Dropbox API webhooks with the `challenge` verification request and `X-Dropbox-Signature` verification, using the App Router.

## Prerequisites

- Node.js 18+
- A Dropbox API app with its App secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Dropbox App secret (App Console > Settings) to `.env.local` as `DROPBOX_APP_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real HMAC-SHA256 signatures):

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 dropbox --path /webhooks/dropbox
```

Add the Hookdeck URL as the Webhook URI in the Dropbox App Console. Dropbox sends the `challenge` GET first, and the server must be running to answer it.

## Endpoints

- `GET /webhooks/dropbox` - answers the `challenge` verification request
- `POST /webhooks/dropbox` - verifies `X-Dropbox-Signature`, then processes `list_folder` notifications
