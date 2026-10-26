# Remote Webhooks - Express Example

Minimal example of receiving Remote webhooks with signature verification
(`X-Remote-Signature`: hex HMAC-SHA256 of `raw_body + ":" + X-Remote-Timestamp`).

## Prerequisites

- Node.js 18+
- A Remote webhook callback and its `signing_key` (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `REMOTE_WEBHOOK_SECRET` to the `signing_key` returned by `POST /v1/webhook-callbacks`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts events at `POST /webhooks/remote`.

## Test

```bash
npm test
```

The tests include the published test vector from Remote's docs. To receive real events locally:

```bash
npx hookdeck-cli listen 3000 remote --path /webhooks/remote
```

Register the URL the CLI prints as your callback URL.
