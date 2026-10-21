# Signal Sciences Webhooks - Express Example

Minimal example of receiving Signal Sciences (Fastly Next-Gen WAF) generic webhooks with `X-SigSci-Signature` verification.

## Prerequisites

- Node.js 18+
- A Fastly Next-Gen WAF generic webhook integration and its signing key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the integration's signing key (Reveal in the console) to `.env` as `SIGNAL_SCIENCES_SIGNING_KEY`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The endpoint is `POST /webhooks/signal-sciences`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 signal-sciences --path /webhooks/signal-sciences
```

Use the URL it prints as the **Webhook URL** of the integration.

## Test

```bash
npm test
```

Tests sign payloads with the same hex HMAC-SHA256 algorithm Fastly uses. To send one by hand:

```bash
BODY='{"created":"2024-02-09T21:08:21Z","type":"flag","payload":{},"link":"x","workspaceId":"www.mysite.com"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SIGNAL_SCIENCES_SIGNING_KEY" | awk '{print $NF}')
curl -X POST localhost:3000/webhooks/signal-sciences -H "Content-Type: application/json" -H "X-SigSci-Signature: $SIG" -d "$BODY"
```
