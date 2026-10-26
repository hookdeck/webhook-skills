# Prometheus Alertmanager Webhooks - Express Example

Minimal example of receiving Prometheus Alertmanager webhooks and authenticating them with the
`Authorization` header (`Bearer` credentials or `basic_auth`).

Alertmanager does not sign payloads, so there is no HMAC to verify. The receiver's `http_config`
sends either `Authorization: Bearer <credentials>` (`authorization`, default type Bearer) or
`Authorization: Basic base64(username:password)` (`basic_auth`) on every request. The handler
compares the credentials with the ones you stored, in constant time. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works, and parses it only after the check.

A static credential authenticates the sender, not the body, and gives no replay protection. Use
HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Prometheus Alertmanager with a webhook receiver (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set the variables for the form your receiver uses. A form left unset is rejected.
   - `authorization`: `ALERTMANAGER_WEBHOOK_SECRET` is the bare secret from the receiver's
     `authorization.credentials` (no `Bearer ` prefix).
   - `basic_auth`: `ALERTMANAGER_WEBHOOK_USERNAME` and `ALERTMANAGER_WEBHOOK_PASSWORD`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/prometheus-alertmanager`.

## Test

```bash
npm test
```

The tests send firing and resolved notifications with correct, wrong, missing and mis-schemed
Bearer and basic_auth credentials. No Alertmanager is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/prometheus-alertmanager \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALERTMANAGER_WEBHOOK_SECRET" \
  -d '{"version":"4","groupKey":"{}:{alertname=\"HighCPU\"}","status":"firing","receiver":"hookdeck","alerts":[{"status":"firing","labels":{"alertname":"HighCPU"},"annotations":{},"startsAt":"2026-10-26T10:00:00Z","endsAt":"0001-01-01T00:00:00Z","fingerprint":"1a2b3c4d5e6f7a8b"}]}'
```

## Receive Webhooks Locally

Alertmanager can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 prometheus-alertmanager --path /webhooks/prometheus-alertmanager
```

Put the printed URL in the receiver's `url`.

## How It Works

- `src/index.js`: `verifyAlertmanagerRequest()` plus the `POST /webhooks/prometheus-alertmanager` route

1. `Authorization: Bearer <credentials>` (any case for the scheme) is compared with
   `ALERTMANAGER_WEBHOOK_SECRET`. `Authorization: Basic ...` is decoded (split on the first colon,
   so a password may contain `:`) and both the username and password are compared. All compares
   are constant-time. A form that isn't configured, a mismatch or a missing header returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. `status` (`firing` or `resolved`) is a state, not an event type. The handler loops over
   `alerts[]` and dispatches on each alert's own `status`.
4. Repeat notifications are skipped using `groupKey` plus each alert's `fingerprint`, `status`,
   `startsAt` and `endsAt` (in-memory here; use a shared store in production).
5. It returns `200 {"received": true}`.
