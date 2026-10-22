# Socure Webhooks - Express Example

Minimal example of receiving Socure RiskOS webhooks and authenticating them with HTTP Basic auth.

Socure does not sign payloads, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)` and compares the username and password each in
constant time, evaluating both before deciding. The route reads the body with `express.raw({ type: '*/*' })`, so any content type works. A static shared credential authenticates the
sender, not the body, and gives no replay protection (no signature, no timestamp): use HTTPS and
rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Socure RiskOS webhook created with Basic Authentication (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SOCURE_WEBHOOK_USERNAME` and `SOCURE_WEBHOOK_PASSWORD` to the credentials entered on the webhook in **Developer Workbench > Webhooks**.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/socure`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong, malformed and missing credentials. No
Socure account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/socure \
  -u "$SOCURE_WEBHOOK_USERNAME:$SOCURE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event_id":"336ccd2a-b3a8-49a8-b2cc-89a4ae90feeb","event_at":"2025-01-15T13:04:11.468Z","event_type":"evaluation_completed","data":{"eval_id":"6dc8f39c","decision":"ACCEPT"}}'
```

## Receive Webhooks Locally

Socure can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 socure --path /webhooks/socure
```

Put the printed URL in the RiskOS webhook configuration. The credentials must arrive on the first
request; a `401` + `WWW-Authenticate` challenge flow won't work through Hookdeck.

## How It Works

- `src/index.js`: `verifySocureRequest()` plus the `POST /webhooks/socure` route

1. The Basic credentials are checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event_type`: `evaluation_completed`, `evaluation_paused`,
   `reevaluation`, `workflow_execution_failed`, `decision_update`, `fraud_confirming`,
   `review_case_assigned`, `review_case_unassigned`, `case_status_updated`, `case_notes_added`,
   `case_attachment_added`, `watchlist_notification_monitored_search_updated`,
   `case_management_notification_case_closure`.
4. It returns `200 {"received": true}`. Deduplicate on `event_id` in production.
