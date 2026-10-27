# MeetGeek Webhooks - Express Example

Minimal example of receiving MeetGeek webhooks with `X-MG-Signature` verification.

## Prerequisites

- Node.js 18+
- A MeetGeek account with the Public API webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
3. Add the webhook secret configured for the MeetGeek Public API to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real webhooks locally:

```bash
npx hookdeck-cli listen 3000 meetgeek --path /webhooks/meetgeek
```

Then set the Hookdeck URL as the webhook URL in the MeetGeek Public API section. The handler reads the body with `express.raw({ type: '*/*' })` so the exact bytes are verified, then branches on `meeting_id`: present means `successful-analysis`, absent means `failed-analysis`.
