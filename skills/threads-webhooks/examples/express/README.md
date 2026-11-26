# Threads Webhooks - Express Example

Minimal example of receiving Threads (Meta) webhooks with the GET verification
handshake and `X-Hub-Signature-256` signature verification.

## Prerequisites

- Node.js 18+
- A [Meta for Developers](https://developers.facebook.com/) app with the Threads API use case and the Threads webhooks sub-use case

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add `THREADS_APP_SECRET` and `THREADS_VERIFY_TOKEN` to `.env`. Use the Threads
   App Secret (Use cases > Customize > Settings in the Threads API use case), not the
   Meta App Secret under App settings > Basic: Threads notifications are signed with
   the Threads App Secret.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

In your Hookdeck project, create a **Threads** source named `threads` and enter the Threads App Secret. Use that source's URL as Meta's Callback URL. Sign the CLI into the same project, then forward the source to your local server.

```bash
npx hookdeck-cli listen 3000 threads --path /webhooks/threads
```

### Run the tests

```bash
npm test
```

## Endpoints

- `GET /webhooks/threads` - Verification handshake (echoes `hub.challenge`)
- `POST /webhooks/threads` - Receives and verifies `replies`, `mentions`, `publish` and `delete` notifications
