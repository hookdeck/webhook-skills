# Threads Webhooks - Next.js Example

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

3. Set `THREADS_APP_SECRET` to the Threads App Secret from **Use cases > Customize >
   Settings** in the Threads API use case. The example uses it to verify signed POSTs.
   If Meta calls this server directly, also set `THREADS_VERIFY_TOKEN` to the value
   you enter in Meta. With a Hookdeck Threads source, enter the verify token in Meta only.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 (`app/webhooks/threads/route.ts`)

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
