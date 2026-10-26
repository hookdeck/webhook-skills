# Formspree Webhooks - Express Example

Minimal example of receiving Formspree webhooks with `Formspree-Signature` verification (HMAC-SHA256 over `<t>.<raw body>`, hex).

## Prerequisites

- Node.js 18+
- A Formspree form on a Professional or Business plan with the Webhook plugin enabled, and its webhook signing secret (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Formspree signing secret to `.env` as `FORMSPREE_WEBHOOK_SECRET`, exactly as Formspree shows it (used as UTF-8 bytes, not decoded).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Run unit tests

```bash
npm test
```

The tests sign payloads with the real algorithm (HMAC-SHA256 hex over `<t>.<raw body>`) and cover multiple `v1` entries, malformed headers, tampered and re-serialised bodies, non-UTF-8 bytes, the opt-in timestamp tolerance, empty Build Hook bodies, wrong-typed fields and duplicate deliveries.

### Forward live submissions with the Hookdeck CLI

```bash
# No account required - first run prints a public URL
npx hookdeck-cli listen 3000 formspree --path /webhooks/formspree
```

Use the printed URL as the webhook URL in your form's Webhook plugin, then submit the form.

## Endpoint

- `POST /webhooks/formspree` - verifies `Formspree-Signature` (401 on failure), then handles the submission. Any content type is accepted; the exact bytes are verified.
- `GET /health` - liveness probe.

## Replay protection (optional)

Off by default: Hookdeck retries and replays resend the original header and timestamp. Set `FORMSPREE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to reject deliveries whose `t` is further than that from now.
