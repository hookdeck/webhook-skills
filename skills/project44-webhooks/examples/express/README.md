# project44 Webhooks - Express Example

Minimal example of receiving project44 webhooks and authenticating them with the `API_KEY`
header.

project44 does not sign payloads, so there is no HMAC to verify. The handler compares the header
you configured (`api_key_name`, read from `PROJECT44_WEBHOOK_HEADER`, default `X-Api-Key`) with
`PROJECT44_WEBHOOK_SECRET` using a constant-time comparison of the **whole** value (no `Bearer `
parsing). The route reads the body with `express.raw({ type: '*/*' })`, so any content type works,
and accepts `POST`, `PUT`, `PATCH` and `GET` (with an empty body).

A static shared credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS, dedupe on `eventId`, and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A project44 webhook configured with an `API_KEY` authentication method (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PROJECT44_WEBHOOK_HEADER` and `PROJECT44_WEBHOOK_SECRET` to the `api_key_name` and exact
   value from your project44 webhook configuration.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/project44`.

## Test

```bash
npm test
```

The tests send every granular event with correct, wrong and missing header values, across
methods and content types. No project44 account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/project44 \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $PROJECT44_WEBHOOK_SECRET" \
  -d '{"eventId":"1","eventType":"shipments.v1.shipment.created","context":{"shipment":{"shipmentId":"abc"}},"data":{}}'
```

## Receive Webhooks Locally

project44 can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 project44 --path /webhooks/project44
```

Put the printed URL in the project44 webhook configuration. Hookdeck's project44 source pre-selects
only `POST`, so allow any other webhook `method` you use on the source.

## How It Works

- `src/index.js`: `verifyProject44Request()` plus the `/webhooks/project44` route

1. The method must be `GET`, `POST`, `PUT` or `PATCH` (`405` otherwise).
2. The header is checked before the body is parsed. Failure returns `401`.
3. An empty body is acknowledged; otherwise it must be a JSON object (`400` otherwise).
4. The handler dispatches on `eventType`: `shipments.v1.shipment.created`,
   `shipments.v1.shipment.deleted`, `shipments.v1.event.added`, `shipments.v1.event.updated`,
   `shipments.v1.event.removed`, `shipments.v1.state.added`, `shipments.v1.state.updated`,
   `shipments.v1.state.removed`, `shipments.v1.exception.addedOrUpdated`.
5. It returns `200 {"received": true}`, or `503` if your handler throws. project44 retries `503`
   but drops `401` and `500`.
