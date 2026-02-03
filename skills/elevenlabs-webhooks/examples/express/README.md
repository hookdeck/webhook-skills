# ElevenLabs Webhooks - Express Example

Minimal example of receiving ElevenLabs webhooks with signature verification.

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
   cp .env.example .env
   ```

3. Add your ElevenLabs webhook signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Development

```bash
npm run dev
```

Uses nodemon for auto-reloading during development.

## Test

```bash
npm test
```

## Endpoints

- `POST /webhooks/elevenlabs` - Receives and verifies ElevenLabs webhooks
- `GET /health` - Health check endpoint

## Local Testing with Hookdeck

Use Hookdeck CLI to receive webhooks locally:

```bash
hookdeck listen 3000 --path /webhooks/elevenlabs
```

This creates a public URL that forwards to your local server.