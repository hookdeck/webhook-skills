# Onfleet Webhooks - Next.js Example

Minimal example of receiving [Onfleet](https://onfleet.com) webhooks. It
answers the `GET ?check=` validation handshake and verifies the
`X-Onfleet-Signature` header (HMAC-SHA512 over the raw body, keyed with the
hex-decoded organisation secret) on every `POST`.

## Prerequisites

- Node.js 20.9+
- An Onfleet account with access to **Configuration → API & Webhook**

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `ONFLEET_WEBHOOK_SECRET` to your organisation's webhook secret. In the
   Onfleet dashboard, go to **Configuration → API & Webhook → Show Secret**
   ([docs](https://docs.onfleet.com/reference/secrets)). It's a hex string, and
   it's not your API key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. The endpoint is `/webhooks/onfleet`:
`GET` answers the validation handshake, `POST` receives events.

## Test

```bash
npm test
```

The tests (Vitest) cover:

- the `GET ?check=` handshake: `200`, plain text, value echoed as-is, no signature required
- valid, missing, invalid and tampered signatures
- regressions for the secret used as a UTF-8 string and for HMAC-SHA256
- fail-closed `500` when the secret is unset or not hex
- every documented trigger (ids 0-30, plus `taskPredictedDelay`) with `null` fields and `data: {}`
- a known-good digest computed the same way as Onfleet's docs sample

## Receive webhooks locally

Start the server first. Onfleet must reach the `GET ?check=` handshake before it
will save the webhook. Then open a tunnel:

```bash
npx hookdeck-cli listen 3000 onfleet --path /webhooks/onfleet
```

No account required. In **Configuration → API & Webhook**, create a webhook
with the printed URL and a trigger such as `taskCreated` (6), then create a task
in the dashboard. Each webhook covers one trigger, so create one per trigger
you want.

## What the handler does

1. `GET`: returns the `check` query value as `text/plain` with `200`.
2. `POST`: checks `ONFLEET_WEBHOOK_SECRET` is valid hex. If not, it returns `500`.
3. Verifies the signature over the **raw** body. On failure it returns `400`.
4. Parses the JSON, responds `200` straight away (Onfleet times out after 10
   seconds), then dispatches on `triggerName`.

See [../../references/verification.md](../../references/verification.md) for
the signature scheme and debugging tips.
