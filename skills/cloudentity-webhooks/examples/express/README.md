# Cloudentity (SecureAuth) Webhooks - Express Example

Minimal example of receiving Cloudentity webhooks and authenticating them with the `X-API-Key`
header. Cloudentity is now SecureAuth; the webhooks come from SecureAuth Connect.

SecureAuth does not sign payloads, so there is no HMAC to verify. The handler compares the whole
`X-API-Key` header value with your Webhook API Key using a constant-time comparison. The route
reads the body with `express.raw({ type: '*/*' })`, so any content type works, and parses it only
after the key check. A static key authenticates the sender, not the body, and gives no replay
protection: serve the endpoint over HTTPS and rotate the key if it leaks.

## Prerequisites

- Node.js 18+
- A SecureAuth Connect workspace with a webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CLOUDENTITY_WEBHOOK_API_KEY` to the Webhook API Key shown when you created the webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/cloudentity`.

## Test

```bash
npm test
```

The tests send batches of events with correct, wrong and missing keys. No SecureAuth account is
needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/cloudentity \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CLOUDENTITY_WEBHOOK_API_KEY" \
  -d '{"audit_events":[{"tenant_id":"example","server_id":"demo","event_id":"1","payload":{"user_created":{}}}]}'
```

## Receive Webhooks Locally

SecureAuth can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 cloudentity --path /webhooks/cloudentity
```

Put the printed URL in the webhook's **URL** field.

## How It Works

- `src/index.js`: `verifyCloudentityRequest()` plus the `POST /webhooks/cloudentity` route

1. The `X-API-Key` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with an `audit_events` array (`400` otherwise).
3. Each audit event is dispatched on its event name in `subject_action` form (`user_created`,
   `user_updated`, `user_deleted`, `user_authenticated`, `group_created`, `login_failed`,
   `consent_revoked`, `client_created`), read as the single key of the event's `payload` object.
   The docs don't name the field that carries the type; that location is inferred from the
   external-logging guide, so confirm it against a real delivery.
4. It returns `200 {"received": true}`.
