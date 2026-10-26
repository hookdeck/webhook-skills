# Agentset Webhooks - Express Example

Minimal example of receiving Agentset webhooks with signature verification.

Agentset sends `agentset-signature`: the bare hex HMAC-SHA256 of the raw request body, keyed with the
webhook's signing secret. Nothing else is signed, so there is no timestamp to check. The route reads
the raw bytes with `express.raw({ type: '*/*' })`, verifies in constant time, and only then parses
JSON. It accepts GET, POST, PUT, PATCH and DELETE, because Agentset's docs don't name the method.

## Prerequisites

- Node.js 18+
- An Agentset webhook and its signing secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AGENTSET_WEBHOOK_SECRET` to the secret from the webhook's **Update Details** tab.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and serves `/webhooks/agentset`.

## Test

```bash
npm test
```

The tests sign payloads based on Agentset's documented examples with real HMAC-SHA256 and cover valid,
missing, malformed, wrong and tampered signatures, every method, empty bodies, any content type and
wrong-typed fields. No Agentset account is needed.

## Receive Webhooks Locally

Agentset can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 agentset --path /webhooks/agentset
```

Use the printed URL as the webhook URL. Hookdeck's Agentset source pre-selects POST without managing
the method, so allow any other method Agentset uses on the source.

## How It Works

- `src/index.js`: `verifyAgentsetSignature()` plus the `/webhooks/agentset` route (`app.all`)

1. The signature is checked over the raw body bytes (zero bytes if there is no body). Failure returns `401`.
2. A verified empty body is acknowledged with `200`.
3. Otherwise the body must be a JSON object (`400` if not).
4. The handler dispatches on the top-level `event`: `document.ready`, `document.error`,
   `document.deleted`, `ingest_job.ready`, `ingest_job.error`. Other events are logged.
5. It returns `200 {"received": true}`.
