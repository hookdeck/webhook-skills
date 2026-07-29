# Cloudinary Webhooks - Next.js Example

Minimal example of receiving Cloudinary webhook notifications and verifying them
with the official `cloudinary` SDK, using the Next.js App Router.

> **Cloudinary signs with your account API Secret.** Each POST carries two
> headers — `x-cld-signature` (a hex digest) and `x-cld-timestamp` (unix seconds).
> The signature is the digest of `rawBody + timestamp + api_secret` (sha1 by
> default, or sha256 if enabled on your account). Verification uses the **raw
> request body** — this route reads it with `await request.text()` and only parses
> the JSON after the signature checks out.

## Prerequisites

- Node.js 18+
- A Cloudinary account and its **API Secret** (Console → Settings → API Keys)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Cloudinary **account API Secret** to `.env` as `CLOUDINARY_API_SECRET`.
   If your account uses sha256 signatures, also set
   `CLOUDINARY_SIGNATURE_ALGORITHM=sha256`.

## Run

```bash
npm run dev
```

The webhook route is available at `POST http://localhost:3000/webhooks/cloudinary`.

## Test

Run the unit tests:

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 cloudinary --path /webhooks/cloudinary
```

## Endpoint

- `POST /webhooks/cloudinary` - Handler at `app/webhooks/cloudinary/route.ts`
