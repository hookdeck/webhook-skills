# AssemblyAI Webhooks - Express Example

Minimal example of receiving AssemblyAI transcript webhooks, authenticated with the custom
header you register on the transcript request.

AssemblyAI does not sign webhooks, so there is no HMAC signature to verify. The handler
compares the header value against your configured secret with a constant-time comparison.

## Prerequisites

- Node.js 18+
- An AssemblyAI account and API key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Choose a header name and a long random value (`openssl rand -hex 32`), set
   `ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME` and `ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE` in `.env`,
   and pass the same two values as `webhook_auth_header_name` and `webhook_auth_header_value`
   when you create a transcript.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/assemblyai`.

## Test

```bash
npm test
```

The tests send deliveries with a correct, wrong and missing auth header and check the
status dispatch. No AssemblyAI account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/assemblyai \
  -H "Content-Type: application/json" \
  -H "$ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME: $ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE" \
  -d '{"transcript_id":"5552493-16d8-42d8-8feb-c2a16b56f6e8","status":"completed"}'
```

## Receive Webhooks Locally

AssemblyAI can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 assemblyai --path /webhooks/assemblyai
```

Use the printed URL as `webhook_url` when you create a transcript.

## How It Works

- `src/index.js`: `verifyAssemblyAIRequest()` plus the `POST /webhooks/assemblyai` route, which reads the body with `express.raw({ type: '*/*' })` so any content type works

1. The request is authenticated before the body is parsed: the header named by
   `ASSEMBLYAI_WEBHOOK_AUTH_HEADER_NAME` must carry `ASSEMBLYAI_WEBHOOK_AUTH_HEADER_VALUE`.
   Failure returns `401`, a 4xx, so AssemblyAI does not retry.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `status` (`completed` or `error`). The payload only holds
   `transcript_id` and `status`: call `GET /v2/transcript/{transcript_id}` for the text or
   the error message.
4. It returns `200 {"received": true}` within AssemblyAI's 10 second limit.
