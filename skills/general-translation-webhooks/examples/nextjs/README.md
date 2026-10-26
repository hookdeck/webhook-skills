# General Translation Webhooks - Next.js Example

Minimal example of receiving [General Translation](https://generaltranslation.com) webhooks with signature verification. Deliveries are signed with Standard Webhooks (`webhook-id`, `webhook-timestamp`, `webhook-signature`) and verified with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent the handler falls back to the `svix-*` header names, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A General Translation organization on the Starter or Enterprise plan
- The signing secret (`whsec_...`) of your webhook endpoint

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Put your endpoint's signing secret in `GENERAL_TRANSLATION_WEBHOOK_SECRET` (keep the `whsec_` prefix). Copy it from the endpoint's detail page under **Organization > Developer > Webhooks** (see [setup](../../references/setup.md)). Each endpoint has its own secret.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/general-translation` ([app/webhooks/general-translation/route.ts](app/webhooks/general-translation/route.ts)).

## Test

```bash
nextjs0
```

The tests sign payloads the way Standard Webhooks does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`). They cover the three event types, `svix-*` header fallback, tampered bodies, stale timestamps, multiple signatures, ignored `v1a` entries, another endpoint's secret, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 general-translation --path /webhooks/general-translation
```

Add the printed HTTPS URL as an endpoint in **Organization > Developer > Webhooks**, select event types such as `translated_file.completed` and `translation_job.completed`, then complete a translation.

## Notes

- nextjs1
- If `GENERAL_TRANSLATION_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones are rejected. For a configurable window use the manual verifier in [references/verification.md](../../references/verification.md).
- The handler dedupes on the event `id` (`evt_...`, equal to `webhook-id`), which stays the same across retries.
- General Translation needs a `2xx` within **10 seconds**. Enqueue the event and process it asynchronously in production.
