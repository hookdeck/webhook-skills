# Bitrise Webhooks - Next.js Example

Minimal example of receiving Bitrise outgoing webhooks and authenticating them with a secret
custom header, using the Next.js App Router.

Bitrise does not sign payloads, so there is no HMAC to verify. You add a header to the outgoing
webhook's **Headers** section, and the route compares it with `BITRISE_WEBHOOK_SECRET` using a
constant-time comparison. The whole header value is compared (a `Bearer ` prefix, if you typed
one, is part of the secret). A static shared credential authenticates the sender, not the body,
and gives no replay protection, so use HTTPS and rotate it if it leaks. The route reads the body
as text, so any content type works.

## Prerequisites

- Node.js 18+
- A Bitrise project with an outgoing webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `BITRISE_WEBHOOK_HEADER` to the header name you added in Bitrise and
   `BITRISE_WEBHOOK_SECRET` to its exact value.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/bitrise`.

## Test

```bash
npm test
```

The tests send Release Management payloads, and a body without `trigger_event`, with correct, wrong and missing headers.
No Bitrise account is needed.

## Receive Webhooks Locally

Bitrise can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 bitrise --path /webhooks/bitrise
```

Put the printed URL in the Bitrise outgoing webhook.

## How It Works

- `lib/verify-bitrise.ts`: `verifyBitriseRequest()`
- `app/webhooks/bitrise/route.ts`: the `POST` handler and event dispatch

1. The configured header is checked before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. A string `trigger_event` marks a Release Management event (`app_version_added`,
   `testflight_upload_completed`, `google_play_upload_completed`, and others). Bitrise documents
   no payload for CI build events, so any other body is acknowledged and its field names logged
   for you to inspect.
4. It returns `200 {"received": true}`.
