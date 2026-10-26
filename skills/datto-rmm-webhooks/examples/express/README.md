# Datto RMM Webhooks - Express Example

Minimal example of receiving Datto RMM Global Webhooks and authenticating them with a secret
header.

Datto RMM does not sign payloads, so there is no HMAC to verify. **Use Global Webhooks.
Per-monitor webhooks can't carry a secret header.** The handler looks up the header you added
(`DATTO_RMM_WEBHOOK_HEADER`, default `Authorization`) case-insensitively and compares the whole
value with `DATTO_RMM_WEBHOOK_SECRET` in constant time. The route reads the body with
`express.raw({ type: '*/*' })`, so JSON, `text/plain` and form-encoded bodies all work.

A static shared credential authenticates the sender, not the body, and gives no replay
protection. Use HTTPS and rotate the secret if it leaks.

## Prerequisites

- Node.js 18+
- A Datto RMM account with Administrator permission (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DATTO_RMM_WEBHOOK_HEADER` and `DATTO_RMM_WEBHOOK_SECRET` to the header Name and exact
   Value you added under **Setup > Integrations > Global Webhooks > Add Header**.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/datto-rmm`.

## Test

```bash
npm test
```

The tests send illustrative alert raised and resolved payloads (JSON, plain text and form
encoded) with correct, wrong and missing header values. No Datto RMM account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/datto-rmm \
  -H "Content-Type: application/json" \
  -H "Authorization: $DATTO_RMM_WEBHOOK_SECRET" \
  -d '{"status":"raised","alert_uid":"a1b2c3d4","alert_message":"C: drive is at 95% capacity"}'
```

## Receive Webhooks Locally

Datto RMM can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 datto-rmm --path /webhooks/datto-rmm
```

Put the printed URL in the Global Webhook URL field.

## How It Works

- `src/index.js`: `verifyDattoRmmRequest()` plus the `POST /webhooks/datto-rmm` route

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body is parsed as form data or JSON when possible, otherwise kept as text. Nothing is
   rejected for its content type.
3. **Illustrative:** the handler dispatches on a `status` field (`raised` or `resolved`) that you
   put in your own payload templates. Datto RMM adds no event field.
4. It returns `200 {"received": true}`.
