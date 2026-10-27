# ReferralHero Webhooks - Express Example

Minimal example of receiving [ReferralHero](https://referralhero.com) webhooks with signature verification (`X-ReferralHero-Signature`, base64 HMAC-SHA256 of the raw body).

## Prerequisites

- Node.js 18+
- A ReferralHero account with a campaign, and its **Webhook Secret Key**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. In ReferralHero, open **Edit Campaign > Integrations > Webhooks**, add a webhook, toggle the events on, and enable **Payload Verification**. Put the generated Webhook Secret Key in `REFERRALHERO_WEBHOOK_SECRET`.

> Signing is opt-in: turn on Payload Verification for the ReferralHero webhook and paste the Webhook Secret Key. Without it, deliveries are unsigned and fail verification.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/referralhero`.

## Test

```bash
npm test
```

The tests sign bodies with the real algorithm and cover every documented event, tampered bodies, wrong secrets, hex or prefixed digests, non-canonical base64, and the fail-closed path.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 referralhero --path /webhooks/referralhero
```

Add the printed URL as the webhook URL in ReferralHero, then use the **Test** button.

## Notes

- `express.raw({ type: '*/*' })` keeps the exact bytes. The body is parsed only after verification.
- The signature is compared as exact, case-sensitive base64 text (44 characters, padded) in constant time.
- No timestamp is signed, so there is no replay window to check.
- Missing, empty, malformed or mismatched signatures get `401`. A good delivery gets `200` with a blank body, which ReferralHero requires.
