# DatoCMS Webhooks - Next.js Example

Minimal example of receiving DatoCMS webhooks and authenticating them with HTTP Basic auth.

DatoCMS does not sign payloads, so there is no HMAC to verify. The route handler decodes the
`Authorization: Basic` header and compares the username and password with the ones you set on the
webhook, each in constant time. It reads the body with `request.text()`, so any content type
works, and parses JSON only after the credential check.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Use HTTPS and rotate the credentials if they leak.

## Prerequisites

- Node.js 20+
- A DatoCMS project (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DATOCMS_WEBHOOK_USERNAME` and `DATOCMS_WEBHOOK_PASSWORD` to the HTTP basic auth
   credentials you enter on the webhook in DatoCMS.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/datocms`.

## Test

```bash
npm test
```

The tests call the route handler with every documented `entity_type`/`event_type` pair and with
correct, wrong and missing credentials. No DatoCMS account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/datocms \
  -u "$DATOCMS_WEBHOOK_USERNAME:$DATOCMS_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"entity_type":"item","event_type":"publish","entity":{"id":"1","type":"item"}}'
```

## Receive Webhooks Locally

DatoCMS can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 datocms --path /webhooks/datocms
```

Put the printed URL, with the same username and password, in the DatoCMS webhook.

## How It Works

- `lib/verify-datocms.ts`: `verifyDatoCmsRequest()`
- `app/webhooks/datocms/route.ts`: the `POST` handler

1. The Basic credentials are checked before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `entity_type` + `event_type`.
4. It returns `200 {"received": true}`.
