# Oura Webhooks - Next.js Example

Minimal example of receiving Oura webhooks with the subscription handshake and
`x-oura-signature` verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- An Oura application (Client ID + Client Secret) from the
  [Oura Developer portal](https://cloud.ouraring.com/oauth/applications)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Fill in `.env`:
   - `OURA_CLIENT_SECRET` — HMAC key for the signature
   - `OURA_VERIFICATION_TOKEN` — the token you pass when creating the subscription

## Run

```bash
npm run dev
```

The route lives at `app/webhooks/oura/route.ts`:

- `GET  /webhooks/oura` — subscription handshake (echoes the `challenge`)
- `POST /webhooks/oura` — receives and verifies webhook events

Server runs on http://localhost:3000

## Test

```bash
npm test
```

The tests import the real `GET`/`POST` route handlers and exercise the handshake plus
event dispatch with real signatures.

### Receive real webhooks locally

In your Hookdeck project, create an **Oura** source named `oura` and enter your Oura client secret. Use that source's URL as the subscription's `callback_url`: a Hookdeck Oura source answers Oura's GET check itself. Sign the CLI into the same project, then forward the source to your local server.

```bash
npx hookdeck-cli listen 3000 oura --path /webhooks/oura
```

Create the subscription with the source's URL as `callback_url` (see
`../../references/setup.md`).
