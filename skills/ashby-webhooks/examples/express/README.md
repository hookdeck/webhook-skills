# Ashby Webhooks - Express Example

Minimal example of receiving Ashby webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Ashby account with a webhook configured (Admin → Integrations → Webhooks)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Ashby webhook secret token to `.env` as `ASHBY_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 ashby --path /webhooks/ashby
```

Use the printed URL as the **Request URL** in your Ashby webhook settings.

### Trigger Test Events

- Creating or editing a webhook in Ashby sends a `ping` event.
- Move a candidate, submit an application, or create an offer to fire real events.

### Run the tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/ashby` - Receives and verifies Ashby webhook events

## Notes

- The event name is in the body (`action`), not a header.
- Verify the `Ashby-Signature` header against the **raw** body before parsing.
- Return `2xx`. Ashby retries other failures up to 10 attempts, but not a `401`, `403`, `404`, `405` or `410`.
