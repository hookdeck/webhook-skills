# Amplitude Webhooks - Express Example

Minimal example of receiving Amplitude webhook streaming requests and authenticating them with a
secret header.

Amplitude does not sign webhook requests, so there is no HMAC to verify. You add a secret header in
the destination's header rows; the handler compares that header's whole value with your stored
secret using a constant-time comparison. A static shared credential authenticates the sender, not
the body, and gives no replay protection: use HTTPS and rotate the secret if it leaks. The route
reads the body with `express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- An Amplitude plan with the Webhook destination (Plus, Growth or Enterprise; see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AMPLITUDE_WEBHOOK_HEADER` to the header name you added in Amplitude (default
   `Authorization`) and `AMPLITUDE_WEBHOOK_SECRET` to its exact, whole value (including any
   `Bearer ` prefix you typed).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/amplitude`.

## Test

```bash
npm test
```

The tests cover correct, wrong, wrong-length and missing secrets, the `Bearer ` prefix, event and
user payloads, and any content type. No Amplitude account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/amplitude \
  -H "Content-Type: application/json" \
  -H "$AMPLITUDE_WEBHOOK_HEADER: $AMPLITUDE_WEBHOOK_SECRET" \
  -d '{"event_type":"Button Clicked","user_id":"user-123","event_properties":{"button":"signup"}}'
```

## Receive Webhooks Locally

Amplitude can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 amplitude --path /webhooks/amplitude
```

Put the printed URL in the Amplitude Webhook destination.

## How It Works

- `src/index.js`: `verifyAmplitudeRequest()` plus the `POST /webhooks/amplitude` route

1. The secret header is looked up case-insensitively and compared in full, in constant time,
   before the body is parsed. Missing or wrong returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A payload with `event_type` is a forwarded event (Amplitude's event format); one with
   `user_id` or `device_id` and no `event_type` is a user update (user format). A FreeMarker
   template changes the shape, so adjust the dispatch to match your template.
4. It returns `200 {"received": true}`.
