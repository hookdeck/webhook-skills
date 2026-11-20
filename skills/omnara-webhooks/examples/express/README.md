# Omnara Webhooks - Express Example

Minimal example of receiving Omnara event webhooks with Standard Webhooks signature verification
(`standardwebhooks` library, `webhook-*` headers with a `svix-*` fallback).

## Prerequisites

- Node.js 18+
- An Omnara event webhook subscription (project **Webhooks** tab). Signing is opt-in: select a
  generic secret generated with `openssl rand -base64 32` as its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the signing secret in `OMNARA_WEBHOOK_SECRET`, exactly as stored in Omnara (a `whsec_` prefix also works)

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

Receive real deliveries locally with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 omnara --path /webhooks/omnara
```

Then use the tunnel URL as the subscription's URL.

## Notes

- The route uses `express.raw({ type: '*/*' })` so the exact bytes are verified for any content type; JSON is parsed only after the check.
- Handled events: `agent_input`, `model_output`, `tool_result`, `context_checkpoint`, `tool_call_update`.
- Missing headers or a bad signature return 400; with no `OMNARA_WEBHOOK_SECRET` the handler returns 500.
- The library enforces a fixed 5-minute timestamp window, so Hookdeck retries and replays older
  than that are rejected. See `references/verification.md` for a manual verifier without the window.
