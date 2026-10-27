# Agora Webhooks - Express Example

Minimal example of receiving Agora webhooks with signature verification (`Agora-Signature`, HMAC-SHA1 hex of the raw body).

## Prerequisites

- Node.js 18+
- An Agora project with a webhook and its Signing Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Signing Secret to `.env` as `AGORA_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and receives webhooks at `POST /webhooks/agora`. The body is read as raw bytes and parsed only after the signature check. Invalid signatures get `401`.

## Test

Run the automated tests (they generate real HMAC-SHA1 signatures):

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 agora --path /webhooks/agora
```

Put the printed URL in the webhook URL field in Agora Console.
