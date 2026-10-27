# Upload-Post Webhooks - Express Example

Minimal example of receiving Upload-Post webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Upload-Post account with a webhook secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Upload-Post webhook secret to `.env`. Paste the whole secret, including the whsec_ prefix. Upload-Post uses it as a plain HMAC key.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 upload-post --path /webhooks/upload-post
```

Then use the Hookdeck URL as your Upload-Post webhook URL.

## Endpoint

- `POST /webhooks/upload-post` - Verifies `X-Upload-Post-Signature` (`sha256=<hex>` HMAC-SHA256 of `<X-Upload-Post-Timestamp>.<raw body>`) and handles `upload_completed`, `social_account_connected`, `social_account_disconnected`, `social_account_reauth_required`, `comment_received` and `dm_received`. The raw body is read with `express.raw({ type: '*/*' })`. Invalid signatures get `401`.
- Optional `UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS` rejects old timestamps (off by default).
