# Trunk Webhooks - Express Example

Minimal example of receiving Trunk webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Trunk signs deliveries per Standard Webhooks with `svix-*` headers).

## Prerequisites

- Node.js 18+
- Trunk organization with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Trunk signing secret to `.env` as `TRUNK_WEBHOOK_SECRET`. You'll find it on
   the endpoint in the Svix App Portal inside the Trunk web app (Merge Queue > Settings > Webhooks).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/trunk
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 trunk --path /webhooks/trunk
```

1. Register the tunnel URL as an endpoint in the Svix App Portal inside the Trunk web app (Merge Queue > Settings > Webhooks, or Settings > Organization > Webhooks).
2. Copy the endpoint's signing secret (`whsec_...`) into `.env`.
3. Send a test event from the portal, e.g. `pull_request.merged`.

## Event Handling

The handler reads the event name from the body's top-level `type` field, routes these
events, and acknowledges anything else with `200`:

- `pull_request.queued`, `.submitted`, `.testing`, `.pending_failure`, `.failed`, `.canceled`, `.merged`
- `pull_request_batch.queued`, `.submitted`, `.testing`, `.pending_failure`, `.failed`, `.canceled`, `.merged`
- `test_case.status_changed`, `v2.test_case.status_changed`
- `test_case.monitor_status_changed`
- `test_case.quarantining_setting_changed`, `v2.test_case.quarantining_setting_changed`
- `test_case.investigation_completed`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
