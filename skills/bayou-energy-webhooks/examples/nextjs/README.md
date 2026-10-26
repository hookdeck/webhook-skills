# Bayou Energy Webhooks - Next.js Example

Minimal example of receiving [Bayou Energy](https://bayou.energy) webhooks with signature verification. Bayou signs deliveries per the [Standard Webhooks](https://www.standardwebhooks.com/) spec, so the handler verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Node.js 18+
- A Bayou Energy account with access to **Settings** in the [Bayou dashboard](https://bayou.energy/dashboard)
- Your company's signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the signing secret from **Settings** (just below the Webhook URL field) in `BAYOU_ENERGY_WEBHOOK_SECRET`. Keep the `whsec_` prefix.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/bayou-energy`.

## Test

```bash
npm test
```

The tests sign payloads the way Bayou does (`base64(HMAC-SHA256(base64decode(secret after "whsec_"), "{webhook-id}.{webhook-timestamp}.{raw body}"))`) and check the signing code against the test vector in Bayou's docs. They cover all seven events, tampered bodies, stale timestamps, multiple signatures, `svix-*` headers, retried deliveries, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 bayou-energy --path /webhooks/bayou-energy
```

Paste the printed URL into the **Webhook URL** field in **Settings** in the Bayou dashboard. Bayou sends every webhook to that one URL.

## Notes

- The route reads the body with `await request.text()`. `request.json()` would re-serialise it and break the signature.
- If `BAYOU_ENERGY_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Bayou payloads have no event ID. The handler dedupes on the `webhook-id` header.
- The library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late retries are rejected. [references/verification.md](../../references/verification.md) has a manual verifier where the window can be dropped or widened.
- The handler doesn't log `file_url` (pre-signed bill URL) or `onboarding_token`.
