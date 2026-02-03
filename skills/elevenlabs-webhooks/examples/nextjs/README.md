# ElevenLabs Webhooks - Next.js Example

Next.js App Router example for receiving ElevenLabs webhooks with signature verification.

## Prerequisites

- Node.js 18+
- ElevenLabs account with webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your ElevenLabs webhook signing secret to `.env.local`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Build

```bash
npm run build
npm start
```

## Test

```bash
npm test
```

## Endpoints

- `POST /webhooks/elevenlabs` - Receives and verifies ElevenLabs webhooks
- `GET /api/health` - Health check endpoint

## Local Testing with Hookdeck

Use Hookdeck CLI to receive webhooks locally:

```bash
hookdeck listen 3000 --path /webhooks/elevenlabs
```

This creates a public URL that forwards to your local server.