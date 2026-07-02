# Zoom Webhooks - Next.js Example

Minimal example of receiving Zoom webhooks with signature verification and the
`endpoint.url_validation` handshake using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Zoom app with Event Subscriptions and a Secret Token
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Zoom app Secret Token to `.env.local` as `ZOOM_WEBHOOK_SECRET_TOKEN`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real Zoom signatures):

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 zoom --path /webhooks/zoom
```

Use the printed URL (with the `/webhooks/zoom` path) as the Event notification
endpoint URL in the Zoom App Marketplace.

## Endpoint

- `POST /webhooks/zoom` - Verifies signatures, answers the url_validation
  handshake, and processes Zoom webhook events
