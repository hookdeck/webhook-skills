# VideoAsk Webhooks - Next.js Example

Minimal example of receiving VideoAsk webhooks and authenticating them with a secret header.

VideoAsk does not sign payloads, so there is no HMAC to verify. You add a header of your choosing
to the webhook (Connect tab **Add a secret**, or the API); the handler compares that header's whole value with your secret
using a constant-time comparison. A static credential authenticates the sender, not the body, and
gives no replay protection, so use HTTPS. The route reads the body with
`request.text()`, so any content type works.

## Prerequisites

- Node.js 20+
- A VideoAsk webhook with a secret header, added in the Connect tab (**Add a secret**) or the API `headers` object (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `VIDEOASK_WEBHOOK_HEADER` to the header name you used (default `secret`) and
   `VIDEOASK_WEBHOOK_SECRET` to its exact value.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/videoask`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing header values. No VideoAsk
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/videoask \
  -H "Content-Type: application/json" \
  -H "secret: $VIDEOASK_WEBHOOK_SECRET" \
  -d '{"event_id":"abc","event_type":"form_response","contact":{"contact_id":"1","answers":[]}}'
```

## Receive Webhooks Locally

VideoAsk can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 videoask --path /webhooks/videoask
```

Use the printed URL as the webhook `url` when you call the VideoAsk API.

## How It Works

- `lib/verify-videoask.ts`: `verifyVideoAskRequest()`
- `app/webhooks/videoask/route.ts`: the `POST /webhooks/videoask` route

1. The configured header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event_type` field: `form_response`,
   `form_response_transcribed`, `form_author_message`, `form_contact_message`,
   `form_contact_tagged`, `form_contact_untagged`.
4. It returns `200 {"received": true}`.
