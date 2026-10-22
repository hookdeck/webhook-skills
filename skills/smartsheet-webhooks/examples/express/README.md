# Smartsheet Webhooks - Express Example

Minimal example of receiving Smartsheet webhooks with signature verification and the verification-challenge handshake.

Smartsheet has no webhook verification SDK helper, so the `Smartsheet-Hmac-SHA256` header is verified manually: hex HMAC-SHA256 of the raw body keyed with the webhook's `sharedSecret`, compared case-insensitively in constant time.

## Prerequisites

- Node.js 18+
- Smartsheet account with API access (to create a webhook and read its `sharedSecret`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook's `sharedSecret` to `.env` as `SMARTSHEET_SHARED_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

The tests sign payloads with the real Smartsheet algorithm and cover the challenge handshake (signed and unsigned), valid, invalid, tampered, and upper-case signatures, and event dispatch.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 smartsheet --path /webhooks/smartsheet
```

Use the printed HTTPS URL as the webhook's `callbackUrl` (`POST /webhooks`), then enable it (`PUT /webhooks/{id}` with `{"enabled": true}`). Smartsheet sends the challenge request, then callbacks as events occur.

## Endpoint

- `POST /webhooks/smartsheet` - Answers `Smartsheet-Hook-Challenge` requests and receives verified callbacks
- `GET /health` - Health check
