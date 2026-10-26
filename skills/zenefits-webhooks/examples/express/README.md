# TriNet Zenefits Webhooks - Express Example

Minimal example of receiving TriNet Zenefits webhooks with `signature` header (HMAC-SHA256, hex) verification.

## Prerequisites

- Node.js 18+
- A Zenefits partner application with its webhook shared secret (not the OAuth client secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your application's webhook shared secret to `.env` as `ZENEFITS_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real events locally, run the Hookdeck CLI in another terminal and use the URL it prints as your webhook URL (Zenefits requires HTTPS):

```bash
npx hookdeck-cli listen 3000 zenefits --path /webhooks/zenefits
```
