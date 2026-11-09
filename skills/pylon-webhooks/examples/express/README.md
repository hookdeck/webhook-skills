# Pylon Webhooks - Express Example

Minimal example of receiving Pylon webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A Pylon webhook (Settings > Integrations & dev > Webhooks) and its secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Pylon webhook secret to `.env` as `PYLON_WEBHOOK_SECRET`
   (Pylon shows the secret only once, when you create the webhook).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the test suite (generates real `X-Pylon-Signature-V2` signatures):

```bash
npm test
```

### Receive real webhooks locally

Forward Pylon deliveries to your local server with the Hookdeck CLI (no account
required — it creates a guest account on first run):

```bash
npx hookdeck-cli listen 3000 pylon --path /webhooks/pylon
```

Put the URL Hookdeck prints into your Pylon webhook's Target URL, add a trigger
with a Send webhook action, then click Test on the saved webhook (tests sent
while creating a webhook are unsigned).

## How It Works

- Uses `express.raw()` so the **raw body** is available for verification.
- Verifies the `X-Pylon-Signature-V2` header: hex HMAC-SHA256 over
  `X-Pylon-Timestamp + "." + rawBody`, compared timing-safe.
- Returns `400` on a missing/invalid signature, `200` once verified.
- Rejects a timestamp more than 5 minutes from now, as Pylon's docs advise.

> Pylon has no event types: the body is the JSON template you write in the
> trigger's Send webhook action. The handler logs fields from the template in
> Pylon's docs; change them to match yours.

## Endpoint

- `POST /webhooks/pylon` - Receives and verifies Pylon webhooks
- `GET /health` - Health check
