# Slack Webhooks - Next.js Example

Minimal example of receiving Slack Events API webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Slack App with **Event Subscriptions** enabled and a signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Slack signing secret to `.env.local` (Slack App → **Basic Information** → **App Credentials** → **Signing Secret**).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward Slack events to your local server (no account needed)
npx hookdeck-cli listen 3000 slack --path /webhooks/slack
```

Paste the Hookdeck URL into your Slack App's **Event Subscriptions → Request URL** field.

### Run Unit Tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/slack` — Verifies the `X-Slack-Signature` header, echoes the `url_verification` challenge, and dispatches `event_callback` events.
