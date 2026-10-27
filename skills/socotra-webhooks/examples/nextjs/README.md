# Socotra Webhooks - Next.js Example

Minimal example of receiving [Socotra](https://www.socotra.com) webhooks with
`socotra-signature` verification (HMAC-SHA256 over `{t}.{raw body}`).

## Prerequisites

- Node.js 18+
- A Socotra webhook endpoint with `hmacEnabled` on, a `secret` set, and **no tag**

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Put the endpoint `secret` in `SOCOTRA_WEBHOOK_SECRET`.

> Turn on HMAC (hmacEnabled) for the Socotra endpoint and leave its tag unset. With a tag, Socotra signs a different string and deliveries fail verification.

## Run

```bash
npm run build && npm start
```

Server runs on http://localhost:3000 (`npm run dev` for development). The route `/webhooks/socotra` accepts GET,
POST, PUT, PATCH and DELETE and verifies the signature first for each.

## Test

```bash
npm test
```

The tests sign requests with the same algorithm Socotra uses. To receive real
deliveries locally:

```bash
npx hookdeck-cli listen 3000 socotra --path /webhooks/socotra
```

Use the printed Hookdeck URL as the webhook `url`. Hookdeck's Socotra source
pre-selects POST without managing the method; allow any other method Socotra uses.
