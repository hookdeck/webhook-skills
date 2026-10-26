# SAP Emarsys Webhooks - Express Example

Minimal example of receiving SAP Emarsys Automation Center Webhook node calls and authenticating
them with HTTP Basic auth.

Emarsys does not sign Webhook node calls, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)` strictly and compares the username and the
password in constant time. A static shared credential authenticates the sender, not the body, and
gives no replay protection, so use HTTPS and rotate the credential if it leaks. The route reads
the body with `express.raw({ type: '*/*' })`, so any content type works, and parses it only after
the check.

## Prerequisites

- Node.js 18+
- A SAP Emarsys Webhook node preset using HTTP basic authentication (see
  [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `EMARSYS_WEBHOOK_USERNAME` and `EMARSYS_WEBHOOK_PASSWORD` to the credentials in the preset.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/emarsys`.

## Test

```bash
npm test
```

The tests send illustrative payloads with correct, wrong, malformed and missing credentials. No
Emarsys account is needed.

To try it by hand (send the header preemptively; this app never sends a 401 challenge, and
neither does Hookdeck):

```bash
curl -X POST http://localhost:3000/webhooks/emarsys \
  -H "Authorization: Basic $(printf '%s' "$EMARSYS_WEBHOOK_USERNAME:$EMARSYS_WEBHOOK_PASSWORD" | base64)" \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","deduplication_id":"dd-1","ems_program_id":4242,"event_time":"2026-10-25T12:00:00Z"}'
```

## Receive Webhooks Locally

Emarsys can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 emarsys --path /webhooks/emarsys
```

Use the printed URL as the preset's HTTPS URL.

## How It Works

- `src/index.js`: `parseBasicAuth()`, `verifyEmarsysRequest()` and the `POST /webhooks/emarsys` route

1. The `Authorization` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object. Anything else returns `406`, which makes Emarsys discard the
   contact and keep the program running (other failures are retried).
3. A repeated `deduplication_id` is acknowledged with `200` and not reprocessed.
4. The payload is illustrative: the real body is whatever the preset defines. A payload with
   `event_data` is logged as an event call, anything else as a contact payload.
5. It returns `200 {"received": true}`.
