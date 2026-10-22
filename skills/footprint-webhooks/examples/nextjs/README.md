# Footprint Webhooks - Next.js Example

Minimal example of receiving Footprint webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Footprint delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Footprint account with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Footprint signing secret to `.env` as `FOOTPRINT_WEBHOOK_SECRET`.
   Footprint's own docs don't show the secret, so the `whsec_` format is Svix's and unconfirmed
   on Footprint's pages.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/footprint
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`).

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 footprint --path /webhooks/footprint
```

1. Register the tunnel URL as a webhook endpoint in the Footprint dashboard.
2. Copy the endpoint's signing secret into `.env`.
3. Complete a sandbox onboarding to trigger `footprint.onboarding.completed`.

## Event Handling

The handler reads the event name from the body's `event_kind` field, routes these events,
and logs anything else:

- `footprint.onboarding.completed`
- `footprint.onboarding.incomplete`
- `footprint.onboarding.status_changed` (deprecated by Footprint)
- `footprint.watchlist_check.completed`
- `footprint.user.manual_review`
- `footprint.user.info_requested`
- `footprint.user.bank_link_updated`
- `footprint.vault.updated`
- `footprint.entity.entity_status_set`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
