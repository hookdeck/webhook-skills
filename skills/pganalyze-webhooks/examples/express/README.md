# pganalyze Webhooks - Express Example

Minimal example of receiving pganalyze webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (pganalyze follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- pganalyze account with Webhooks enabled (Early Access) and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your pganalyze webhook secret to `.env` as `PGANALYZE_WEBHOOK_SECRET`
   (the full `whsec_...` signing secret, shown in the **Webhooks** panel under **Settings > Integrations**; it is shared by the whole organization).

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/pganalyze
```

## Test

```bash
npm test
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), and check that the
`svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 pganalyze --path /webhooks/pganalyze
```

1. In pganalyze go to **Settings > Integrations**, open the **Webhooks** panel and click **Add Webhook**.
2. Enter a name and the tunnel URL, copy the **Signing secret** into `.env`, then click **Test and Add**. pganalyze sends a signed `ping`, and only adds the webhook if your handler returns a `2xx`.
3. Under **Alerts & Check-Up > Alert Destinations**, add the webhook to a destination, then route checks to it on the **Alert Rules** tab to receive `issue.*` events.

## Event Handling

Every body is `{ type, id, timestamp, version, organization, data }`. The handler reads the event name from the top-level `type` field, routes these events, and logs anything else:

- `issue.triggered`, `issue.escalated`, `issue.downgraded`
- `issue.acknowledged`, `issue.reopened`, `issue.resolved`
- `ping` (the test event sent by **Test and Add**)

The issue is in `data.issue` (`id`, `severity`, `state`, `checkKind`, `description`). The body `id` equals the `webhook-id` header and stays the same across retries: use it to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
