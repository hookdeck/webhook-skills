# Gitea Webhooks - Express Example

Minimal example of receiving Gitea webhooks with signature verification (`X-Gitea-Signature`, HMAC-SHA256).

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
   cp .env.example .env
   ```

3. Add your Gitea webhook Secret to `.env` as `GITEA_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/gitea`.

The route reads the raw body with `express.raw({ type: '*/*' })`, so both `application/json` and `application/x-www-form-urlencoded` deliveries verify.

## Test

Run the unit tests (they generate real signatures):

```bash
npm test
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 3000 gitea --path /webhooks/gitea
```

Then add the Hookdeck URL as the Target URL under **Settings → Webhooks → Add Webhook → Gitea** and use **Test Delivery** to send a `push` event.
