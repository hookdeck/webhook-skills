# Stedi Webhooks - Next.js Example

Minimal example of receiving [Stedi](https://www.stedi.com) event destination webhooks with signature verification in a Next.js App Router route handler. Stedi follows the [Standard Webhooks](https://www.standardwebhooks.com) specification: `webhook-id`, `webhook-timestamp` and `webhook-signature` headers.

## Prerequisites

- Node.js 18+
- A Stedi account with an event destination and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put the destination's signing secret in `STEDI_WEBHOOK_SECRET`. Copy it from the destination's **Overview** tab in the Stedi portal, or fetch it with `GET /destinations/{id}/secret` (see [setup](../../references/setup.md)).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/stedi`.

## Test

```bash
npm test
```

The tests sign payloads the Standard Webhooks way (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`) and call the route handler directly. They cover tampered bodies, the docs' `timestamp.body` variant (rejected), secret rotation (several signatures), another destination's secret, retried deliveries, the optional timestamp window, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 stedi --path /webhooks/stedi
```

Create an event destination in the Stedi portal pointing at the printed URL, subscribe to events such as `transaction.processed` and `enrollment.activated`, then click **Ping** on the destination's **Event deliveries** tab.

## Notes

- The handler reads `await request.text()`. The signature covers the exact raw body bytes, so `request.json()` before verification breaks it.
- Verification is manual rather than the `standardwebhooks` package. `webhook-timestamp` is when Stedi **created** the event, and Stedi retries for up to 48 hours. The package's fixed 5-minute window would reject every retry. Set `STEDI_TIMESTAMP_TOLERANCE_SECONDS` if you want a window anyway.
- If `STEDI_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unverified requests.
- Stedi events are thin: they carry `type`, `resource` and `relatedResources`, not the data. Call the Stedi API for the current state.
- The handler dedupes on `webhook-id`, which stays the same across retries. Stedi only treats `2xx` as success and does not follow redirects.
