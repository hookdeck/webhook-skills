# Facebook Webhooks - Next.js Example

Minimal example of receiving Facebook (Meta Graph API) webhooks in a Next.js App
Router route handler, with the GET verification handshake and X-Hub-Signature-256
signature verification.

## Prerequisites

- Node.js 18+
- A [Meta for Developers](https://developers.facebook.com/) app with the Webhooks
  product configured (App Secret + Verify Token)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your `FACEBOOK_APP_SECRET` and `FACEBOOK_VERIFY_TOKEN` to `.env.local`

## Run

```bash
npm run dev
```

The webhook route is available at http://localhost:3000/webhooks/facebook

## Test

### Using Hookdeck CLI

```bash
# Forward a Facebook-type Hookdeck source named "facebook" to localhost
npx hookdeck-cli listen 3000 facebook --path /webhooks/facebook
```

Create the source with the **Facebook** source type first, because Meta sends a `GET`
verification request when you save the URL. Use the source URL as your **Callback URL** in
App Dashboard → Webhooks.

### Run the tests

```bash
npm test
```

## Route

- `GET /webhooks/facebook` - Verification handshake (echoes `hub.challenge`)
- `POST /webhooks/facebook` - Receives and verifies Facebook webhook events

Implemented in `app/webhooks/facebook/route.ts`.
