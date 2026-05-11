# Intercom Webhooks - Express Example

Minimal example of receiving Intercom webhooks with `X-Hub-Signature` HMAC-SHA1
verification.

## Prerequisites

- Node.js 18+
- An Intercom app in the Developer Hub (for the `client_secret`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Intercom app's `client_secret` to `.env`:
   - In the Intercom Developer Hub, open your app → **Basic Information** →
     copy the **Client secret**.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 intercom --path /webhooks/intercom
```

Then paste the printed URL as the **Endpoint URL** in your Intercom app's
Webhooks settings.

### Trigger Test Events

- Saving the webhook in the Developer Hub triggers a `ping` event.
- Starting a conversation in Intercom triggers `conversation.user.created`.
- Replying triggers `conversation.user.replied` / `conversation.admin.replied`.

## Run the test suite

```bash
npm test
```

## Endpoint

- `POST /webhooks/intercom` — receives and verifies Intercom notifications
- `GET /health` — health check
