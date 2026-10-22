# Foursquare Webhooks - Next.js Example

Minimal example of receiving Foursquare Movement SDK (formerly Pilgrim SDK)
server webhooks with `Pilgrim-Secret` authentication, using the Next.js App Router.

> **Foursquare does not sign webhook payloads.** There is no signature to
> compute. Every request carries the secret from the Developer Console's
> Pilgrim page, raw, in the `Pilgrim-Secret` header. This example compares it
> to `FOURSQUARE_PILGRIM_SECRET` in constant time, then parses the body as JSON.

## Prerequisites

- Node.js 18+
- A Foursquare Developer Console project with the Movement SDK enabled

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Pilgrim secret (Developer Console > Pilgrim page) to `.env.local` as
   `FOURSQUARE_PILGRIM_SECRET`. If it is unset, the endpoint returns `500` (fails closed).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

Run the unit tests:

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 foursquare --path /webhooks/foursquare
```

Use the Hookdeck URL as the server URL on the Movement SDK Webhooks page in the
Developer Console.

Send a request manually:

```bash
curl -X POST http://localhost:3000/webhooks/foursquare \
  -H "Pilgrim-Secret: your_pilgrim_secret" \
  -H "Content-Type: application/json" \
  -d '{"pilgrimVisitId":"4c4763f7646e38002cc51789","eventType":"placeArrival","timestamp":1548182419000}'
```

## Endpoint

- `POST /webhooks/foursquare` - Verifies `Pilgrim-Secret`, dispatches on `eventType`
