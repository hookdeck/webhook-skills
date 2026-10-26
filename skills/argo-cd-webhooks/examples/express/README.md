# Argo CD Webhooks - Express Example

Minimal example of receiving Argo CD notification webhooks and authenticating them with a
header you configure.

Argo CD does not sign webhooks, so there is no HMAC to verify. The notifications engine sends
every header set on the webhook service, so the handler compares one header with a shared
secret using a constant-time comparison. A static credential authenticates the sender, not the
body, and gives no replay protection. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

Argo CD sends GET unless the notification template sets a method, so the route accepts GET,
POST, PUT, PATCH and DELETE, checks the credential first for every method, and handles an
empty body.

## Prerequisites

- Node.js 18+
- Argo CD with Notifications and a webhook service (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ARGO_CD_WEBHOOK_HEADER` to the header name you added to the webhook service (default
   `Authorization`) and `ARGO_CD_WEBHOOK_SECRET` to its exact, whole value (including any
   `Bearer ` prefix you typed).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/argo-cd`.

## Test

```bash
npm test
```

The tests cover correct, wrong and missing credentials, every method, empty bodies and the
illustrative payloads. No Argo CD cluster is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/argo-cd \
  -H "Content-Type: application/json" \
  -H "Authorization: $ARGO_CD_WEBHOOK_SECRET" \
  -d '{"trigger":"on-sync-succeeded","app":"guestbook","sync_status":"Synced","health":"Healthy"}'
```

The payload is an illustrative one from the template in the setup guide. Argo CD has no event
field; your own template defines the body.

## Receive Webhooks Locally

Argo CD can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 argo-cd --path /webhooks/argo-cd
```

Argo CD sends GET unless the notification template sets a method, so Hookdeck's Argo CD source
allows GET and POST.

## How It Works

- `src/index.js`: `verifyArgoCdRequest()` plus one handler registered for each method

1. The configured header is checked before the body is read. Failure returns `401`.
2. An empty body (the GET default) returns `200 {"received": true}`.
3. Otherwise the body must be a JSON object (`400` otherwise).
4. The handler dispatches on the illustrative `trigger` field: `on-sync-succeeded`,
   `on-sync-failed`, `on-health-degraded`.
5. It returns `200 {"received": true}`.

`basicAuth` on the Argo CD webhook service is not covered by Hookdeck's Argo CD source; use a
header.
