# Deepgram Webhooks - Next.js Example

Minimal example of receiving Deepgram webhooks with authentication verification using Next.js App Router.

## Prerequisites

- Node.js 18+
- Deepgram account with API access

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Deepgram API Key ID to `.env.local`:
   - Log into [Deepgram Console](https://console.deepgram.com/)
   - Navigate to API Keys
   - Copy the API Key ID (not the key itself)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test Webhook Locally

1. Start the development server:
   ```bash
   npm run dev
   ```

2. In another terminal, use Hookdeck CLI to create a tunnel:
   ```bash
   hookdeck listen 3000 --path /webhooks/deepgram
   ```

3. Use the provided URL when making Deepgram requests:
   ```bash
   curl -X POST \
     --header "Authorization: Token YOUR_DEEPGRAM_API_KEY" \
     --header "Content-Type: audio/wav" \
     --data-binary @audio.wav \
     "https://api.deepgram.com/v1/listen?callback=YOUR_HOOKDECK_URL"
   ```

## Run Tests

```bash
npm test
```

## Implementation Notes

- Uses Next.js App Router with Route Handlers
- Verifies webhooks using the `dg-token` header
- Returns appropriate HTTP status codes
- Handles JSON payloads with transcription results
- Includes comprehensive test coverage with Vitest