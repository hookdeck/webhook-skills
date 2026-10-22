# Coterie Webhooks - Next.js Example

Minimal example of receiving Coterie application, quote and policy webhooks and
authenticating them with the `Authentication` header.

Coterie does not sign payloads. The only authentication is an opt-in static header named
`Authentication` (not `Authorization`) that Coterie sends as `Authentication: token <guid>`.
The handler compares the **whole header value**, including the `token ` prefix, with a
constant-time comparison.

## Prerequisites

- Node.js 18+
- A Coterie partner account. Ask your Coterie contact to enable the `Authentication` header
  and webhooks (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `COTERIE_AUTHENTICATION` to the full header value, e.g. `token 1234-...`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/coterie`.

## Test

```bash
npm test
```

The tests send the documented application, quote and policy shapes with correct, wrong and
missing `Authentication` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/coterie \
  -H "Content-Type: application/json" \
  -H "Authentication: $COTERIE_AUTHENTICATION" \
  -d '{"applicationId":"83857350-4bfb-4669-862c-61f05a7a4be9","Status":"ReadyToQuote"}'
```

## Receive Coterie Webhooks Locally

```bash
npx hookdeck-cli listen 3000 coterie --path /webhooks/coterie
```

Give the printed URL to your Coterie contact as the webhook URL.

## How It Works

- `app/webhooks/coterie/route.ts`: the `POST /webhooks/coterie` route
- `lib/verify-coterie.ts`: `verifyCoterieRequest()` and `classify()`

1. The body is read with `request.text()`, so any content type works.
2. `Authentication` is compared with `COTERIE_AUTHENTICATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. Coterie payloads have no event-type field, so the handler classifies them by identifier:
   `quoteId` (quote), `PolicyId` (policy), `applicationId` (application).
5. It returns `200 {"received": true}`.
