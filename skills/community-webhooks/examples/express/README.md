# Community Webhooks - Express Example

Minimal example of receiving Community (community.com) webhooks with
`community-signature` HMAC-SHA256 verification.

## Prerequisites

- Node.js 18+
- A Community account with **webhook permission** and a configured webhook
  (Dashboard → Settings → Integrations → Webhooks). Contact
  <yourfriends@community.com> if the option is not available on your plan.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook's **signature secret** to `.env` as
   `COMMUNITY_WEBHOOK_SECRET`. It is shown in the webhook modal in the Community
   Dashboard and is unique to each webhook — it is *not* your
   `community_api`-prefixed Async REST API token.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward Community webhooks to your local server (no account needed)
npx hookdeck-cli listen 3000 community --path /webhooks/community
```

Paste the HTTPS URL the CLI prints into the **endpoint URL** field of your
webhook in the Community Dashboard. Community only accepts HTTPS endpoints with
a valid certificate, so a tunnel is required for local development.

### Trigger Test Events

Community has no "send test event" button, so trigger real events:

- `member.created` — have a test phone number join your Community
- `message.inbound` — text your Community number from that phone
- `message.outbound` — DM that member from the Dashboard
- `member.updated` — change a standard personal data field for the member
- `member.opted_out` and `member.updated` — have the test number text `STOP`
- `member.deleted` — have the test member delete themselves

### Run Unit Tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/community` — Verifies the `community-signature` header
  (HMAC-SHA256 of `{t}.{raw_body}`, hex), deduplicates on the event `id`, and
  dispatches `message.inbound`, `message.outbound`, `member.created`,
  `member.updated`, `member.deleted`, and `member.opted_out`.
- `GET /health` — Health check.

## Notes

- **Raw body is required.** The route uses
  `express.raw({ type: 'application/json' })` — parsing JSON before verifying
  changes the bytes and breaks the signature.
- **At-least-once delivery.** Community can send the same event more than once.
  The example keeps an in-memory set of event ids for two hours; use Redis or your
  database in production.
- **Respond within 15 seconds** with a 2xx. Failed deliveries are retried up to
  5 times with increasing backoff for up to an hour, and persistently failing
  webhooks may be disabled by Community.
