# Ampersand Webhooks - Next.js Example

Minimal example of receiving Ampersand webhooks in the Next.js App Router with signature
verification using the [`svix`](https://www.npmjs.com/package/svix) library (Ampersand delivers
webhooks through Svix).

## Prerequisites

- Node.js 22+
- An Ampersand webhook destination and its Webhook Signing Secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add the destination's Webhook Signing Secret to `.env.local` (`AMPERSAND_WEBHOOK_SECRET`)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/ampersand
```

`app/webhooks/ampersand/route.ts` reads the raw body with `request.text()`, verifies `svix-id`,
`svix-timestamp` and `svix-signature` (helpers in `lib/ampersand.ts`), then dispatches on
`notificationType` (notifications) or treats the body as a read/subscribe result.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 ampersand --path /webhooks/ampersand
```

Use the printed URL as the URL of your Ampersand webhook destination.

## Manual Testing

Trigger a notification (for example connect and disconnect an installation) or run a read action
that targets the webhook destination, and watch the server log.
