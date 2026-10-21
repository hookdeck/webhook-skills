# Sovos Webhooks - Express Example

Minimal example of receiving Sovos e-invoicing (Indirect Tax API) webhooks with
signature verification. Sovos delivers through Svix, so verification uses the
official [`svix`](https://www.npmjs.com/package/svix) SDK.

## Prerequisites

- Node.js 22+ (the `svix` 2.x package requires it)
- A Sovos webhook endpoint configured in the Svix Consumer App Portal, with its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env` as `SOVOS_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook endpoint is
`POST http://localhost:3000/webhooks/sovos`.

## Test

```bash
npm test
```

The tests sign payloads with the Svix algorithm and cover valid events,
secret rotation, invalid signatures, tampered bodies, and stale timestamps.

## Local Testing with Hookdeck

Expose your local server (no account required):

```bash
npx hookdeck-cli listen 3000 sovos --path /webhooks/sovos
```

Add the printed URL as an endpoint in the Svix Consumer App Portal, then send an
example event from the portal's **Testing** tab.
