# JazzHR Webhooks - Next.js Example

Minimal example of receiving JazzHR candidate-export webhooks with signature verification.

## Prerequisites

- Node.js 18+
- A JazzHR account with a custom integration (Settings > Integrations) and its Secret Key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `JAZZHR_WEBHOOK_SECRET` in `.env` to the Secret Key you entered on the JazzHR custom integration.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 jazzhr --path /webhooks/jazzhr
```

Use the URL it prints as the Integration [Webhook] URL in JazzHR. Saving the integration sends a signed `VERIFY` event, which the handler answers with `200`.

## Notes

- The route reads the raw body with `request.text()`, so verification works for any content type.
- `X-JazzHR-Signature` is the bare hex HMAC-SHA256 of the raw body. The event type is in `X-JazzHR-Event` (`CANDIDATE-EXPORT` or `VERIFY`).

## Test

```bash
npm test
```
