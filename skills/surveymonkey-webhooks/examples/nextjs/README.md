# SurveyMonkey Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving [SurveyMonkey](https://www.surveymonkey.com) webhooks and verifying the `Sm-Signature` HMAC (and answering the `HEAD` check).

## Prerequisites

- Node.js 18+
- A SurveyMonkey app with a client ID, client secret and the Create/Modify Webhooks scope (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `SURVEYMONKEY_CLIENT_ID` and `SURVEYMONKEY_CLIENT_SECRET` in `.env.local`. The example joins them as `<client ID>&<client secret>`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/surveymonkey` (and `HEAD` for SurveyMonkey's URL check) in [app/webhooks/surveymonkey/route.ts](app/webhooks/surveymonkey/route.ts); the verification code is in [lib/verify-surveymonkey.ts](lib/verify-surveymonkey.ts).

## Test

```bash
npm test
```

The tests cover the `<client ID>&<secret>` key, a key of the secret alone (rejected), the `HEAD` check, a valid signature with the SurveyMonkey content type, another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and missing credentials.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 surveymonkey --path /webhooks/surveymonkey
```

Create a webhook with `POST /v3/webhooks` and the printed URL as `subscription_url`. If the `HEAD` check fails through the CLI URL, add `?bypass_ping=true` to that call.

## Notes

- The route reads `request.arrayBuffer()` before parsing. The HMAC covers the exact raw body, so don't call `request.json()` first.
- The exported `HEAD` handler answers SurveyMonkey's URL check with `200`.
