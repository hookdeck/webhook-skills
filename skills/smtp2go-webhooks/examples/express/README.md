# SMTP2GO Webhooks - Express Example

Minimal example of receiving SMTP2GO email and SMS webhooks and authenticating them with the
`Authorization` header.

SMTP2GO does not sign payloads. The only credential is the optional Authorization header set on
the webhook. The handler compares the **whole header value**, including the `Bearer ` or `Basic `
prefix, with a constant-time comparison. A static credential authenticates the sender, not the
body, and gives no replay protection, so use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- An SMTP2GO account

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set an Authorization header on the SMTP2GO webhook and paste the full value, including the "Bearer " or "Basic " prefix.
   Capture one delivery to see exactly what arrives, then set `SMTP2GO_AUTHORIZATION` to that value
   (see [../../references/setup.md](../../references/setup.md)).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/smtp2go`.

## Test

```bash
npm test
```

The tests send email and SMS events as JSON and form-encoded bodies with correct, wrong and
missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/smtp2go \
  -H "Content-Type: application/json" \
  -H "Authorization: $SMTP2GO_AUTHORIZATION" \
  -d '{"event":"delivered","rcpt":"user@example.com","email_id":"1abcDE-ABC123-xy"}'
```

## Receive SMTP2GO Webhooks Locally

```bash
npx hookdeck-cli listen 3000 smtp2go --path /webhooks/smtp2go
```

Use the printed URL as the SMTP2GO webhook URL.

## How It Works

- `src/index.js`: `verifySmtp2goRequest()`, `parseBody()` and the `POST /webhooks/smtp2go` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared in full with `SMTP2GO_AUTHORIZATION`. Failure returns `401`.
3. Only then is the body parsed: JSON or form encoded (`400` if neither parses).
