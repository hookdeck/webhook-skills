# Bolt Webhooks - Express Example

Minimal example of receiving Bolt webhooks with signature verification (`X-Bolt-Hmac-Sha256`, base64 HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- Bolt Merchant Dashboard account with a Signing Secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Signing Secret (Merchant Dashboard > Administration > API > Signing Secret) to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000, webhook endpoint `POST /webhooks/bolt`.

## Test

Run the automated tests (they generate real signatures):

```bash
npm test
```

To receive real webhooks locally, start a tunnel (no account required):

```bash
npx hookdeck-cli listen 3000 bolt --path /webhooks/bolt
```

Then add the Hookdeck URL as a webhook endpoint under **Administration > Developers > Webhooks** in the Bolt Merchant Dashboard and complete a sandbox checkout.
