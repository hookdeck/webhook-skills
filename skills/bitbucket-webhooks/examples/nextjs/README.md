# Bitbucket Webhooks - Next.js Example

Minimal example of receiving Bitbucket Cloud webhooks with signature verification
using the Next.js App Router.

## Prerequisites

- Node.js 18+
- Bitbucket repository with a webhook configured (with a secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Bitbucket webhook secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 bitbucket --path /webhooks/bitbucket
```

Then configure the Hookdeck URL in your Bitbucket repository webhook settings.

### Run the tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/bitbucket` - Receives and verifies Bitbucket webhook events
