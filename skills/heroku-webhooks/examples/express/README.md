# Heroku Webhooks - Express Example

Minimal example of receiving Heroku app webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Heroku app and the [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) (`heroku-cli/6.13.19` or later)
- A webhook signing secret (chosen with `--secret`, or generated and shown once by `heroku webhooks:add`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Heroku webhook secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 heroku --path /webhooks/heroku
```

Then subscribe your app to the Hookdeck URL:

```bash
heroku webhooks:add -i api:release,api:build -l notify \
  -u https://hkdk.events/your-source-id -s "$HEROKU_WEBHOOK_SECRET" -a your-app
```

### Using ngrok

```bash
ngrok http 3000
```

Use the ngrok URL (plus `/webhooks/heroku`) as the `-u` value.

## Endpoint

- `POST /webhooks/heroku` - Verifies `Heroku-Webhook-Hmac-SHA256` and handles the event; replies `204`
