# KoboToolbox Webhooks - Next.js Example

Minimal example of receiving KoboToolbox REST Service requests and authenticating them with HTTP
Basic auth.

KoboToolbox does not sign requests, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)`, then compares the username and the password
each in constant time (both are evaluated before deciding). The route reads the body with `request.text()`, so any content type works. The body is accepted as JSON or XML
and is only parsed after the credential check.

> A static shared credential authenticates the sender, not the body, and gives no replay
> protection (no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 20+
- A KoboToolbox project with a REST Service (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `KOBOTOOLBOX_WEBHOOK_USERNAME` and `KOBOTOOLBOX_WEBHOOK_PASSWORD` to the credentials you
   enter in the REST Service.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/kobotoolbox`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and malformed credentials, plus JSON and XML bodies. No
KoboToolbox account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/kobotoolbox \
  -u "$KOBOTOOLBOX_WEBHOOK_USERNAME:$KOBOTOOLBOX_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"_id":1234,"_uuid":"1f4f1a52-3c1e-4d0b-9a55-0c1f0e2a7a11","_submission_time":"2026-10-22T09:30:00","_xform_id_string":"aXyZ123","name":"Amina"}'
```

## Receive Webhooks Locally

KoboToolbox can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 kobotoolbox --path /webhooks/kobotoolbox
```

Put the printed URL in the REST Service endpoint field.

## How It Works

1. The `Authorization` header is checked before the body is parsed. Missing, malformed or
   mismatched credentials return `401`.
2. The body is read raw. If it parses as JSON it is treated as the submission (`_id`, `_uuid`,
   `_submission_time`, `_xform_id_string`, question fields); otherwise it is kept as text (XML).
3. There is no event type: every request is a new submission.
4. It returns `200 {"received": true}`.
