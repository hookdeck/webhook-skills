# People Data Labs Webhooks - Express Example

Minimal example of receiving People Data Labs webhooks and authenticating them with the secret
header registered by the PDL team.

PDL does not sign payloads, so there is no HMAC to verify. The handler compares one header with
your shared secret using a constant-time comparison. The header name comes from
`PEOPLE_DATA_LABS_WEBHOOK_HEADER` (default `Authorization`) and the whole header value from
`PEOPLE_DATA_LABS_WEBHOOK_SECRET`. A static credential authenticates the sender, not the body,
and gives no replay protection, so use HTTPS and rotate it if it leaks. The route reads the body
with `express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- A PDL Enterprise account; the People Data Labs team registers webhooks for Enterprise
  customers. Ask them to include a secret header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PEOPLE_DATA_LABS_WEBHOOK_SECRET` to the exact header value you gave PDL (including any
   `Bearer ` prefix), and `PEOPLE_DATA_LABS_WEBHOOK_HEADER` to its name.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/people-data-labs`.

## Test

```bash
npm test
```

The tests send batches with correct, wrong and missing headers. No PDL account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/people-data-labs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-shared-key" \
  -d '["9adnit66-hdZ5lkBbq-AOQ_0000","YraxDoP16jzyjfxtn-1XJQ_0000"]'
```

## Receive Webhooks Locally

PDL can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 people-data-labs --path /webhooks/people-data-labs
```

Give the printed URL to your PDL team as the target URL.

## How It Works

- `src/index.js`: `verifyPdlRequest()` plus the `POST /webhooks/people-data-labs` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON array of ID strings (`400` otherwise).
3. The handler logs the batch (the one event: a person record update batch). Dedupe and store
   the IDs, then re-enrich.
4. It returns `200 {"received": true}`. PDL does not retry on failure.
