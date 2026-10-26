# parcelLab Webhooks - Express Example

Minimal example of receiving parcelLab tracking webhooks and authenticating them with
HTTP Basic credentials.

parcelLab does not sign payloads. It sends `Authorization: Basic base64(username:password)`
with the credentials you gave it. The handler splits the decoded value on the first colon and
compares username and password each in constant time. A static credential authenticates the
sender, not the body, and gives no replay protection, so use HTTPS and rotate the credential
if it leaks.

## Prerequisites

- Node.js 18+
- A parcelLab account, with Basic credentials you have given parcelLab
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PARCELLAB_WEBHOOK_USERNAME` and `PARCELLAB_WEBHOOK_PASSWORD` to the credentials you gave parcelLab.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/parcellab`.

## Test

```bash
npm test
```

The tests cover correct, wrong and malformed Basic credentials, all eleven events, and the
CloudEvents shape. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/parcellab \
  -u "$PARCELLAB_WEBHOOK_USERNAME:$PARCELLAB_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event":"onDelivered","eventid":"abc123-def456","references":{"tracking_number":"00340000000001"}}'
```

## Receive parcelLab Webhooks Locally

```bash
npx hookdeck-cli listen 3000 parcellab --path /webhooks/parcellab
```

Give the printed URL, plus your Basic credentials, to parcelLab as the webhook target.

## How It Works

- `src/index.js`: `verifyParcellabRequest()` plus the `POST /webhooks/parcellab` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. The `Authorization: Basic` header is parsed and compared. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. The event comes from `event`, or from the CloudEvents `type`, and is dispatched.
5. It returns `200 {"received": true}`.
