# Tikkie Webhooks - Express Example

A minimal example of receiving Tikkie API v2 (ABN AMRO) notifications in Express.

> **Tikkie notifications are not signed.** They have no signature header, no
> secret and no HMAC. This example applies the two mitigations the skill
> recommends instead. See the skill's `references/verification.md`.

## What this example shows

- `app.post('/webhooks/tikkie', express.json(), ...)`, which dispatches on the `notificationType` body field: `PAYMENT`,
  `REFUND` or `BUNDLE`.
- Shape validation: `subscriptionId` and `notificationType` are always required,
  `paymentRequestToken` and `paymentToken` for PAYMENT/REFUND, `refundToken` for
  REFUND, and `bundleId` for BUNDLE.
- A **subscriptionId check** against `TIKKIE_SUBSCRIPTION_ID`. A mismatch
  returns `403`. If the variable is unset, the check is skipped with a warning.
- A **re-fetch** of the authoritative record from the Tikkie API with `API-Key` +
  `X-App-Token`. A Tikkie `404` returns `403` (forged tokens), and other API
  errors return `502` so Tikkie retries. If the credentials are unset, the
  re-fetch is skipped.
- Unknown `notificationType` values are logged and acknowledged with `200`.

## Prerequisites

- Node.js 18+ (it uses the global `fetch`)
- A Tikkie API key (developer.abnamro.com) and an app token (the Tikkie Business
  Portal, or `POST /sandboxapps` in the sandbox)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TIKKIE_SUBSCRIPTION_ID` to the `subscriptionId` returned by
   `POST /paymentrequestssubscription` (and/or `/transactionssubscription`,
   comma-separated). Set `TIKKIE_API_KEY` and `TIKKIE_APP_TOKEN` to enable the
   re-fetch. There's **no webhook signing secret**.

## Run

```bash
npm start
```

The server runs on http://localhost:3000.

## Test

```bash
npm test
```

The tests mock the Tikkie API, so they make no network calls.

Send a notification by hand (the spec's PAYMENT example):

```bash
curl -X POST http://localhost:3000/webhooks/tikkie \
  -H "Content-Type: application/json" \
  -d '{"subscriptionId":"6289db02-d422-4e93-b65c-30fa973bd341","notificationType":"PAYMENT","paymentRequestToken":"qzdnzr8hnVWTgXXcFRLUMc","paymentToken":"21ef7413-cc3c-4c80-9272-6710fada28e4"}'
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 tikkie --path /webhooks/tikkie
```

Register the printed URL with `POST /paymentrequestssubscription`. Tikkie
sends no signature, so this handler's checks still apply.

## Endpoint

- `POST /webhooks/tikkie` returns `200 {"received": true}`. It returns `400` for
  invalid JSON or missing fields, `403` for an unknown subscriptionId or an
  unconfirmed record, and `502` when the Tikkie API is unreachable.
- `GET /health` is a health check.
