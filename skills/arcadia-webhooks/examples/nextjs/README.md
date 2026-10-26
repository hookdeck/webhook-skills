# Arcadia Webhooks - Next.js Example

Minimal example of receiving Arcadia webhooks and authenticating them with the custom header
Arcadia support configures.

Arcadia does not sign payloads, so there is no HMAC to verify. The handler reads the header named
by `ARCADIA_WEBHOOK_HEADER` (default `X-Arcadia-Token`, looked up case-insensitively) and compares
its whole value with `ARCADIA_WEBHOOK_SECRET` in constant time. The route reads the body with
`request.text()`, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay
protection (no signature, no timestamp). Use HTTPS and rotate the value if it leaks.

## Prerequisites

- Node.js 20+
- An Arcadia account; support sets the header name and value (see [../../references/setup.md](../../references/setup.md))

Arcadia support sets the header name and value: open a support ticket to request one. Values cannot contain spaces.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ARCADIA_WEBHOOK_HEADER` and `ARCADIA_WEBHOOK_SECRET` to the header name and exact value
   configured by Arcadia support.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/arcadia`.

## Test

```bash
npm test
```

The tests send every handled event with correct, wrong and missing header values. No Arcadia
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/arcadia \
  -H "Content-Type: application/json" \
  -H "X-Arcadia-Token: $ARCADIA_WEBHOOK_SECRET" \
  -d '{"id":"whk_1","eventType":"STATUS_CHANGE","resource":"CREDENTIAL","createdAt":"2024-02-21T00:00:00.000+00:00","businessUnitIds":[],"errors":[],"data":{"id":"crd_1"}}'
```

## Receive Webhooks Locally

Arcadia can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 arcadia --path /webhooks/arcadia
```

## How It Works

- `lib/verify-arcadia.ts`: `verifyArcadiaRequest()`
- `app/webhooks/arcadia/route.ts`: the `POST /webhooks/arcadia` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. Payloads whose `id` was already handled are acknowledged without reprocessing.
4. The handler dispatches on `eventType`: `STATUS_CHANGE`, `NEW_DATA_AVAILABLE`,
   `EXISTING_DATA_UPDATED`, `DATA_DELETED`, `BUSINESS_UNIT_ASSIGNMENT`,
   `REAL_TIME_CREDENTIAL_VALIDATION_SUCCESS`, `REAL_TIME_CREDENTIAL_VALIDATION_FAILURE`,
   `MFA_CHALLENGE_METHOD`, `MFA_CHALLENGE_CODE`.
5. It returns `200 {"received": true}`.
