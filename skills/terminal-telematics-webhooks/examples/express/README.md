# Terminal Webhooks - Express Example

Minimal example of receiving Terminal webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Terminal delivers webhooks through Svix).

## Prerequisites

- Node.js 18+
- Terminal account with a webhook endpoint registered in the Terminal dashboard and its Svix signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the endpoint's signing secret (the full `whsec_...` value) to `.env` as `TERMINAL_TELEMATICS_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/terminal-telematics
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
npx hookdeck-cli listen 3000 terminal-telematics --path /webhooks/terminal-telematics
```

1. Register the tunnel URL as a webhook endpoint in the Terminal dashboard.
2. Copy the endpoint's signing secret into `.env`.
3. Connect a test fleet provider account (or request a sync) to trigger `connection.created` and `sync.completed`.

## Event Handling

The handler reads the event name from the body's top-level `type` field (the body is
`{id, type, detail}`; `detail` holds the related entities such as `connection` and `sync`),
routes these events, and acknowledges anything else with `200`:

- `connection.created`, `connection.completed`, `connection.reconnected`, `connection.updated`, `connection.disconnected`, `connection.pending_deletion`, `connection.deleted`
- `sync.requested`, `sync.started`, `sync.completed`, `sync.failed`, `connection.first_sync_completed`
- `delivery.requested`, `delivery.started`, `delivery.completed`, `delivery.failed`
- `issue.reported`, `issue.resolved`
- `provider.availability_updated`, `unsupported_provider.requested`, `link.analytics_event_emitted`
- `vehicle.added`, `vehicle.modified`, `vehicle.removed`
- `driver.added`, `driver.modified`, `driver.removed`
- `trailer.added`, `trailer.modified`, `trailer.removed`
- `safety_event.added`, `safety_event.modified`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
