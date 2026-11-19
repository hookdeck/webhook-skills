# Zoho Flow Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving requests from Zoho Flow's [Send Webhook action](https://help.zoho.com/portal/en/kb/flow/user-guide/create-a-flow/webhook/articles/outgoing-webhooks) and authenticating them with a secret header.

Zoho Flow doesn't sign these requests. The action sends a secret header (an API Key auth profile with header placement, or a header on the action), and the route compares that header's whole value with `ZOHO_FLOW_WEBHOOK_SECRET` in constant time. The action's method is yours to choose, so the route exports GET, POST, PUT, PATCH and DELETE.

## Prerequisites

- Node.js 18+
- A Zoho Flow account (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `ZOHO_FLOW_WEBHOOK_HEADER` to the header name (the auth profile's Parameter Name, default `X-Webhook-Secret`) and `ZOHO_FLOW_WEBHOOK_SECRET` to the exact key.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `/webhooks/zoho-flow` in [app/webhooks/zoho-flow/route.ts](app/webhooks/zoho-flow/route.ts); the header check is in [lib/verify-zoho-flow.ts](lib/verify-zoho-flow.ts).

## Test

```bash
npm test
```

The tests cover the right, wrong, missing and prefixed header values, a key sent in the query string instead of a header, a custom header name, case-insensitive lookup, every method, a GET whose query string is the payload, malformed JSON, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 zoho-flow --path /webhooks/zoho-flow
```

Use the printed HTTPS URL as the Send Webhook action's HTTP URL, click **Save**, then **Test**.

## Notes

- The route reads `request.text()` so any Content-Type works. The header is checked before the body is read.
- Payloads are illustrative: Flow sends whatever you configure, with no event name of its own. The handler expects an `event` field.
- If `ZOHO_FLOW_WEBHOOK_SECRET` is unset the route returns `500`. It never accepts unauthenticated requests.
- The response is JSON. With the action's Response Type set to JSON or Auto, its keys become variables for later steps.
