# Front Webhooks - Next.js Example

Minimal example of receiving Front application webhooks with signature verification and the
`X-Front-Challenge` subscription handshake, using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Front app with a webhook signing key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Front app signing key to `.env` as `FRONT_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests (they generate real Front signatures):

```bash
npm test
```

### Receive real webhooks locally

Create a Front source in Hookdeck Event Gateway (source type **Front**, with your app's
signing key), then forward it to your local server with the Hookdeck CLI, where `frontapp`
is the source's name:

```bash
npx hookdeck-cli listen 3000 frontapp --path /webhooks/frontapp
```

Use the source's URL as the Webhook URL in your Front app. When you save the Webhook feature,
Front sends an `X-Front-Challenge` validation request to that URL and only saves the feature
if the request is answered.

## Endpoint

- `POST /webhooks/frontapp` - Receives, validates the challenge, and verifies Front webhooks
  (see `app/webhooks/frontapp/route.ts`)
