# DoorDash Drive Webhooks - Express Example

Minimal example of receiving DoorDash Drive delivery webhooks and authenticating them with the
`Authorization` header.

DoorDash Drive does not sign payloads. Despite the "Basic Auth" label in the Developer Portal,
DoorDash sends **whatever text you enter** as the `Authorization` header (often a bare token, not
base64 `user:pass`). The handler compares the **whole header value** with a constant-time
comparison: it does not strip a scheme prefix and does not decode it as HTTP Basic. OAuth, the
other portal option, is not covered here.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A DoorDash Developer Portal account with a Drive webhook endpoint (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DOORDASH_DRIVE_AUTHORIZATION` to the exact text you entered in the Developer Portal.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/doordash-drive`.

## Test

```bash
npm test
```

The tests send the documented delivery events and a refund payload with correct, wrong and
missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/doordash-drive \
  -H "Content-Type: application/json" \
  -H "Authorization: $DOORDASH_DRIVE_AUTHORIZATION" \
  -d '{"event_name":"DASHER_PICKED_UP","external_delivery_id":"c19a5d37-e457-4247-9a67-921ec0134125"}'
```

## Receive DoorDash Drive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 doordash-drive --path /webhooks/doordash-drive
```

Use the printed URL as the webhook URL in the Developer Portal.

## How It Works

- `src/index.js`: `verifyDoorDashDriveRequest()`, `classify()` and the `POST /webhooks/doordash-drive` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works and nothing is parsed before the credential check.
2. `Authorization` is compared in full with `DOORDASH_DRIVE_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. Delivery webhooks are dispatched on `event_name`; refund webhooks have no `event_name` and
   are recognised by `event_data`. `dasher_enroute_to_*` events (opt-in) are matched by prefix.
5. It returns `200 {"received": true}`. DoorDash sends each event up to 3 times unless it gets `200 OK`.
