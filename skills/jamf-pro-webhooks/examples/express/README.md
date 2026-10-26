# Jamf Pro Webhooks - Express Example

Minimal example of receiving Jamf Pro webhooks and authenticating them with Header Authentication.

Jamf Pro webhooks are unsigned, so there is no HMAC to verify. The handler compares the configured
header (`JAMF_PRO_WEBHOOK_HEADER`, default `Authorization`) with `JAMF_PRO_WEBHOOK_SECRET` using a
constant-time comparison of the whole value. The route reads the raw body with `express.raw({ type: '*/*' })`, so any content type works. JSON is assumed.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Jamf Pro webhook with Header Authentication (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `JAMF_PRO_WEBHOOK_HEADER` and `JAMF_PRO_WEBHOOK_SECRET` to the header name and value you
   entered for Header Authentication on the Jamf Pro webhook. Jamf Pro shows the setup note
   "Choose Header Authentication on the Jamf Pro webhook and enter the same header name and value here."

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/jamf-pro`.

## Test

```bash
npm test
```

The tests send all 22 documented `webhookEvent` values with correct, wrong and missing header
values. No Jamf Pro server is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/jamf-pro \
  -H "Content-Type: application/json" \
  -H "$JAMF_PRO_WEBHOOK_HEADER: $JAMF_PRO_WEBHOOK_SECRET" \
  -d '{"webhook":{"id":1,"name":"test","webhookEvent":"ComputerAdded","eventTimestamp":1761400000000},"event":{"udid":"A1B2C3D4","deviceName":"Mac-1","serialNumber":"C02XXXXXXXXX","jssID":42}}'
```

## Receive Webhooks Locally

Jamf Pro can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 jamf-pro --path /webhooks/jamf-pro
```

Put the printed URL in the Jamf Pro webhook.

## How It Works

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise, including XML).
3. The handler dispatches on `webhook.webhookEvent`: `ComputerAdded`, `ComputerCheckIn`,
   `ComputerInventoryCompleted`, `MobileDeviceEnrolled`, `JSSStartup` and the rest of the 22
   documented events. Unknown events are acknowledged.
4. It returns `200 {"received": true}`.
