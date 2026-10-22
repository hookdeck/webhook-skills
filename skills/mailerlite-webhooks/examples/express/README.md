# MailerLite Webhooks - Express Example

Minimal example of receiving MailerLite webhooks with signature verification.

## Prerequisites

- Node.js 18+
- MailerLite account with a webhook created through the API (the response includes its `secret`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your MailerLite webhook secret to `.env`

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
npx hookdeck-cli listen 3000 mailerlite --path /webhooks/mailerlite
```

Then create a MailerLite webhook (`POST https://connect.mailerlite.com/api/webhooks`) pointing at the Hookdeck URL.

## Endpoint

- `POST /webhooks/mailerlite` - Receives and verifies MailerLite webhook events (single and batched)
