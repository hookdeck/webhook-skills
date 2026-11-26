# SurveyMonkey Webhooks - Express Example

Minimal Express example of receiving [SurveyMonkey](https://www.surveymonkey.com) webhooks and verifying the `Sm-Signature` HMAC (and answering the `HEAD` check).

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
   cp .env.example .env
   ```

3. Set `SURVEYMONKEY_CLIENT_ID` and `SURVEYMONKEY_CLIENT_SECRET` in `.env`. The example joins them as `<client ID>&<client secret>`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint: `POST /webhooks/surveymonkey` (and `HEAD` for SurveyMonkey's URL check) in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests cover the `<client ID>&<secret>` key, a key of the secret alone (rejected), a hex signature (rejected), the `HEAD` check, a valid signature with the `application/vnd.surveymonkey.response.v1+json` content type, a survey event, another secret, a tampered body, a missing header, a trailing newline in the secret, invalid JSON, and missing credentials.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 surveymonkey --path /webhooks/surveymonkey
```

Create a webhook with `POST /v3/webhooks` and the printed URL as `subscription_url`. A plain CLI source answers `HEAD` with `405`, so add `?bypass_ping=true` to that call (or first create a SurveyMonkey-type source named `surveymonkey` and run `npx hookdeck-cli login`, so the CLI reuses it).

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, and SurveyMonkey's `application/vnd.surveymonkey...+json` Content-Type would make `express.json()` skip the body.
- `app.head()` answers SurveyMonkey's URL check with `200`. It runs no verification because the `HEAD` request has no body or signature.
