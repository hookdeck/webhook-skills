# People Data Labs Webhooks - Next.js Example

Minimal example of receiving People Data Labs webhooks with the App Router and authenticating
them with the secret header registered by the PDL team.

PDL does not sign payloads, so there is no HMAC to verify. The route compares one header with
your shared secret in constant time. The header name comes from
`PEOPLE_DATA_LABS_WEBHOOK_HEADER` (default `Authorization`) and the whole header value from
`PEOPLE_DATA_LABS_WEBHOOK_SECRET`. A static credential authenticates the sender, not the body,
and gives no replay protection, so use HTTPS and rotate it if it leaks. The body is read as text,
so any content type works.

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
   cp .env.example .env.local
   ```

3. Set `PEOPLE_DATA_LABS_WEBHOOK_SECRET` to the exact header value you gave PDL (including any
   `Bearer ` prefix), and `PEOPLE_DATA_LABS_WEBHOOK_HEADER` to its name.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/people-data-labs`.

## Test

```bash
npm test
```

No PDL account is needed. To try it by hand:

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

- `lib/verify-pdl.ts`: `verifyPdlRequest()`
- `app/webhooks/people-data-labs/route.ts`: the `POST` handler

The header is checked first (`401` on failure), the body must be a JSON array of ID strings
(`400` otherwise), and the handler returns `200 {"received": true}`. PDL does not retry on
failure.
