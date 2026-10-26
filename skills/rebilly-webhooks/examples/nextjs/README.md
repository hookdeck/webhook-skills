# Rebilly Webhooks - Next.js Example

Minimal example of receiving Rebilly webhooks and authenticating them with HTTP basic access
authentication.

Rebilly also signs every webhook (a `Security-Signature` JWT and Standard Webhooks `v1a` Ed25519
signatures), but Hookdeck's Rebilly source checks only basic auth, so this example does too. A
static credential authenticates the sender, not the body, and gives no replay protection: use
HTTPS and rotate the credential if it leaks. See
[../../references/verification.md](../../references/verification.md) for the optional signature checks.

## Prerequisites

- Node.js 18+
- A Rebilly account with a webhook that has HTTP basic access authentication credentials (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `REBILLY_WEBHOOK_USERNAME` and `REBILLY_WEBHOOK_PASSWORD` in `.env` to the credentials configured on the Rebilly webhook.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts GET, POST, PUT, PATCH and DELETE at `/webhooks/rebilly`.

## Test

```bash
npm test
```

The tests send every handled event with each of GET, POST, PUT, PATCH and DELETE, and with correct, wrong, missing and malformed credentials. No Rebilly account is needed.

To try it by hand (the credentials are sent as `Authorization: Basic base64(username:password)`):

```bash
curl -X POST http://localhost:3000/webhooks/rebilly \
  -u "$REBILLY_WEBHOOK_USERNAME:$REBILLY_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"customer-created","customerId":"cus_123"}'
```

## Receive Webhooks Locally

Rebilly can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 rebilly --path /webhooks/rebilly
```

Put the printed URL in the Rebilly webhook, set HTTP basic access authentication on it, and allow
the webhook's method (GET, POST, PUT, PATCH or DELETE) on the Hookdeck source: it pre-selects POST.
Hookdeck never sends a 401 challenge, so the credentials must arrive with each request.

## How It Works

- `lib/verify-rebilly.ts`: `verifyRebillyRequest()`
- `app/webhooks/rebilly/route.ts`: one handler exported as `GET`, `POST`, `PUT`, `PATCH` and `DELETE`

1. Credentials are checked before the body is read, for every method. Failure returns `401`.
2. An empty body (GET, DELETE or an empty template) returns `200`.
3. Otherwise the body must be a JSON object (`400` otherwise); the handler dispatches on `eventType`: `transaction-processed`, `transaction-declined`, `customer-created`, `subscription-activated`, `subscription-canceled`, `invoice-issued`, `invoice-paid`, `data-export-completed`.
4. It returns exactly `200 {"received": true}`. Rebilly retries on any other status, or no response within 20 seconds.
