# Metabase Webhooks - Express Example

Minimal example of receiving Metabase alert webhooks, authenticating the HTTP Basic credentials.

Metabase does not sign webhooks. Choose **Basic** authentication on the webhook and the request carries `Authorization: Basic base64(username:password)`.

## Prerequisites

- Node.js 18+
- A Metabase webhook (Admin > Settings > Webhooks) using Basic authentication

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put the username and password you set on the Metabase webhook in `.env`
   (`METABASE_WEBHOOK_USERNAME`, `METABASE_WEBHOOK_PASSWORD`).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

To receive real alerts locally, tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 metabase --path /webhooks/metabase
```

Use the printed URL as the webhook URL in Metabase, then send a test alert.

Or send one by hand:

```bash
curl -X POST http://localhost:3000/webhooks/metabase \
  -u "$METABASE_WEBHOOK_USERNAME:$METABASE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"type":"alert","alert_id":null,"data":{"type":"question","question_id":1,"question_name":"Sales","question_url":"https://example.com/question/1","raw_data":{"cols":[],"rows":[]}}}'
```

## Notes

- A static shared credential authenticates the sender, not the body, and gives no replay protection. Use HTTPS and rotate the credential if it leaks.
- The body is read with `express.raw({ type: '*/*', limit: '10mb' })` and parsed only after the credential check. Alerts embed a base64 PNG, so the default 100kb limit is too small.
