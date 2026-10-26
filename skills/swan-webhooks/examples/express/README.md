# Swan Webhooks - Express Example

Minimal example of receiving Swan webhooks and authenticating them with the `x-swan-secret` header.

Swan does not sign payloads, so there is no HMAC to verify. The handler compares the whole value of
the `x-swan-secret` header with your webhook secret using a constant-time comparison. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works.

> A static shared secret authenticates the sender, not the body, and gives no replay protection
> (no signature, no timestamp). Use HTTPS and rotate the secret if it leaks.

## Prerequisites

- Node.js 18+
- A Swan project with a webhook subscription (see [../../references/setup.md](../../references/setup.md))

Set a webhook secret on the Swan webhook subscription. Subscriptions without one send nothing to verify.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SWAN_WEBHOOK_SECRET` to the secret you set on the Swan webhook subscription.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/swan`.

## Test

```bash
npm test
```

The tests send documented events with correct, wrong and missing secrets. No Swan account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/swan \
  -H "Content-Type: application/json" \
  -H "x-swan-secret: $SWAN_WEBHOOK_SECRET" \
  -d '{"eventType":"Transaction.Booked","eventId":"evt_1","eventDate":"2021-08-18T09:35:46.673Z","projectId":"project-id","resourceId":"resource-id"}'
```

## Receive Webhooks Locally

Swan can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 swan --path /webhooks/swan
```

Use the printed URL as the endpoint of the Swan webhook subscription.

## How It Works

- `src/index.js`: `verifySwanRequest()` plus the `POST /webhooks/swan` route

1. The `x-swan-secret` header is checked before the body is parsed. A missing or different value returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The notification is thin: `{eventType, eventId, eventDate, projectId, resourceId}`. Dispatch on
   `eventType` (`Transaction.Booked`, `Transaction.Pending`, `Transaction.Rejected`,
   `Account.Created`, `AccountHolder.Updated`, `Card.Created`, `Onboarding.Updated`) and query the
   Swan API with `resourceId` for details.
4. Duplicate `eventId`s are acknowledged without reprocessing (delivery is at-least-once).
5. It returns `200` quickly; Swan expects a `200 OK` within 10 seconds.
