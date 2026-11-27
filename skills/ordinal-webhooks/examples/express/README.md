# Ordinal Webhooks - Express Example

Receives [Ordinal](https://www.tryordinal.com/) (tryordinal.com) webhooks in Express and
verifies each delivery's Standard Webhooks signature with the `standardwebhooks` library,
as Ordinal's docs recommend.

## Prerequisites

- Node.js 18+
- An Ordinal webhook and its `whsec_` signing secret (from the Create webhook response or
  the webhook's configure page)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables and set `ORDINAL_WEBHOOK_SECRET`:
   ```bash
   cp .env.example .env
   ```

3. Create the webhook in **Settings > Integrations > Webhooks**, or with the API:
   ```bash
   curl -X POST "https://app.tryordinal.com/api/v1/webhooks" \
     -H "Authorization: Bearer $ORDINAL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"name":"CRM Sync","url":"https://<your-public-url>/webhooks/ordinal",
          "topics":["post.published","post.publish_failed","post.approval.requested"]}'
   ```
   Save `signingSecret` from the response: later reads omit it.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/ordinal`.

## Test

```bash
npm test
```

The tests sign Ordinal's documented example payloads with a test secret, then check a
changed body, a wrong secret, an old timestamp, missing headers and a rotation with two
signatures.

## Notes

- The route uses `express.raw()`. A JSON body parser in front of it changes the bytes and
  breaks verification.
- `webhook-id` is the same on a retry, so the example deduplicates on it.
- `webhook-topic` repeats the event type but isn't signed. Route on `type` from the
  verified body.
- Ordinal documents no test or ping event. Perform the action in the app to trigger one.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 ordinal --path /webhooks/ordinal
```

No account required. The CLI gives you a public HTTPS URL to use as the webhook's `url`,
plus a web UI for inspecting and replaying requests.
