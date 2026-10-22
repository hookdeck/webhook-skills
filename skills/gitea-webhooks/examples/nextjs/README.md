# Gitea Webhooks - Next.js Example

Minimal example of receiving Gitea webhooks with signature verification (`X-Gitea-Signature`, HMAC-SHA256) using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Gitea repository, organization, or instance where you can add webhooks, and the webhook **Secret**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Gitea webhook Secret to `.env.local` as `GITEA_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real signatures and call the route handler):

```bash
npm test
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 gitea --path /webhooks/gitea
```

Then add the Hookdeck URL as the Target URL under **Settings → Webhooks → Add Webhook → Gitea** and use **Test Delivery** to send a `push` event.

## Endpoint

- `POST /webhooks/gitea` - Receives and verifies Gitea webhook events. The body is read with `request.text()`, so JSON and form-encoded deliveries both verify.
