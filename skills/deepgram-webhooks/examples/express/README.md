# Deepgram Webhooks - Express Example

Minimal example of receiving Deepgram webhooks with authentication verification.

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
   cp .env.example .env
   ```

3. Set your callback credentials in `.env`:
   - `DEEPGRAM_CALLBACK_USERNAME` / `DEEPGRAM_CALLBACK_PASSWORD`: the Basic Auth credentials you embed in the callback URL (`https://username:password@your-domain.com/webhooks/deepgram`)
   - Optional `DEEPGRAM_API_KEY_ID`: the API Key ID from the [Deepgram Console](https://console.deepgram.com/) (not the key itself), used to check the `dg-token` header when Deepgram sends it

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test Webhook Locally

1. Start the server:
   ```bash
   npm start
   ```

2. In another terminal, use Hookdeck CLI to create a tunnel:
   ```bash
   npx hookdeck-cli listen 3000 deepgram --path /webhooks/deepgram
   ```

3. Use the provided URL when making Deepgram requests:
   ```bash
   curl -X POST \
     --header "Authorization: Token YOUR_DEEPGRAM_API_KEY" \
     --header "Content-Type: audio/wav" \
     --data-binary @audio.wav \
     "https://api.deepgram.com/v1/listen?callback=YOUR_HOOKDECK_URL"
   ```
   Insert your callback credentials into the URL (`https://username:password@...`), percent-encoding any special characters, so the handler's Basic Auth check passes.

## Run Tests

```bash
npm test
```

## Implementation Notes

- Verifies webhooks with the Basic Auth credentials embedded in the callback URL
- Checks the `dg-token` header only when present (Deepgram does not send it on every callback)
- Reads `request_id` from `metadata.request_id` (the callback body is `{ metadata, results }`)
- Returns appropriate HTTP status codes
- Handles JSON payloads with transcription results
- Includes comprehensive test coverage