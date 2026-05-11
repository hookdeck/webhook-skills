# Twilio Webhooks - Express Example

Minimal Express server that receives Twilio webhooks (incoming SMS, voice, status callbacks) and verifies the `X-Twilio-Signature` header using the official [twilio Node SDK](https://www.npmjs.com/package/twilio).

## Prerequisites

- Node.js 18+
- A [Twilio account](https://www.twilio.com/try-twilio) and Auth Token

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Add your Twilio Auth Token to `.env`.

## Run

```bash
npm start
```

The server listens on http://localhost:3000 and exposes:

- `POST /webhooks/twilio` — verified webhook receiver
- `GET /health` — health check

## Test

Run the test suite:

```bash
npm test
```

The tests generate real Twilio signatures (HMAC-SHA1 + base64) and exercise:

- Incoming SMS with a valid signature → 200 + TwiML response
- Message status callback → 204
- Voice call webhook → 200 + TwiML
- Missing / invalid signature → 403

## Wire it up to Twilio

1. Expose the local server with a public tunnel:

   ```bash
   npx hookdeck-cli listen 3000 twilio --path /webhooks/twilio
   # or: ngrok http 3000
   ```

2. In the Twilio Console, set the public URL as your number's Messaging or Voice webhook (or as the `StatusCallback` when creating outbound messages/calls).

3. Send a test SMS to your Twilio number and watch the server logs.
