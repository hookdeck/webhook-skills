# CompanyCam Webhooks - Express Example

Minimal example of receiving CompanyCam webhooks with `X-CompanyCam-Signature` verification
(base64 HMAC-SHA1 of the raw body).

## Prerequisites

- Node.js 18+
- A CompanyCam webhook created **with a `token`** (without one, deliveries are unsigned and fail verification)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook token to `.env` as `COMPANYCAM_WEBHOOK_TOKEN`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real signatures):

```bash
npm test
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel CompanyCam webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 3000 companycam --path /webhooks/companycam
```

Use the printed HTTPS URL as the `url` when creating the CompanyCam webhook
(`POST /public_api/v1/webhooks`, with a `token`).

## Endpoint

- `POST /webhooks/companycam` - Receives and verifies CompanyCam webhooks
- `GET /health` - Health check
