# Dynatrace Webhooks - Next.js Example

Minimal example of receiving Dynatrace problem notification webhooks and authenticating them with
a secret header.

Dynatrace does not sign payloads, so there is no HMAC to verify. The handler looks up the header
you added as an "Additional HTTP header" (name from `DYNATRACE_WEBHOOK_HEADER`, default
`Authorization`, matched case-insensitively) and compares the **whole** value with
`DYNATRACE_WEBHOOK_SECRET` in constant time. A static shared credential authenticates the sender,
not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

**Send the secret in a custom header, not as a token in the webhook URL.**

The body is a template you write; the vendor adds no event field. This example assumes an
illustrative JSON template with `ProblemID`, `State`, `ProblemTitle` and `ImpactedEntity`, and
dispatches on `State`: `OPEN` is handled, and any other value (the docs don't show the one sent
when a problem resolves) is logged. The route reads the body as text, so any content type works.

## Prerequisites

- Node.js 18+
- A Dynatrace custom webhook integration (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DYNATRACE_WEBHOOK_HEADER` to the header name and `DYNATRACE_WEBHOOK_SECRET` to the exact,
   whole header value (including any `Bearer ` prefix) you added in Dynatrace.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/dynatrace`.

## Test

```bash
npm test
```

The tests cover correct, wrong, different-length and missing header values, non-JSON bodies, and
both problem states. No Dynatrace account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/dynatrace \
  -H "Content-Type: application/json" \
  -H "$DYNATRACE_WEBHOOK_HEADER: $DYNATRACE_WEBHOOK_SECRET" \
  -d '{"ProblemID":"P-2401","State":"OPEN","ProblemTitle":"Response time degradation"}'
```

## Receive Webhooks Locally

Dynatrace can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 dynatrace --path /webhooks/dynatrace
```

Put the printed URL in the Dynatrace webhook integration.

## How It Works

- `lib/verify-dynatrace.ts` and `app/webhooks/dynatrace/route.ts`: `verifyDynatraceRequest()` and the route plus the `POST /webhooks/dynatrace` route

1. The secret header is checked before the body is read or parsed. Failure returns `401`.
2. JSON object bodies are dispatched on `State`; other content (text, XML) is acknowledged.
3. It returns `200 {"received": true}`.
