# Crusoe Cloud Webhooks - Next.js Example

Minimal example of receiving Crusoe Cloud notification webhooks with signature
verification using the official [`svix`](https://docs.svix.com/receiving/verifying-payloads/how) SDK.

Crusoe routes webhook notifications through Svix. Crusoe does not publish its own
verification docs, so the headers (`svix-id`, `svix-timestamp`, `svix-signature`),
the HMAC-SHA256 scheme and the `whsec_` secret format here are Svix defaults.

## Prerequisites

- Node.js 22.12+
- A Crusoe Cloud webhook endpoint and its `whsec_` signing secret (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing secret to `.env` as `CRUSOE_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/crusoe
```

## Test

```bash
npm test
```

The tests sign requests with the Svix algorithm and use the documented
`resource.automated_remediation` example payload.

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 crusoe --path /webhooks/crusoe
```

Add the printed URL as a **Webhook** endpoint in the Crusoe Cloud Console
(bell icon → **All Notifications** → **Manage Slack/Webhook** → **Add Endpoint**),
then use the Svix dashboard's **Testing** tab to send an example event.

## Project Structure

```
├── app/webhooks/crusoe/route.ts   # Webhook handler (App Router)
├── test/webhook.test.ts           # Tests
└── vitest.config.ts               # Test configuration
```

## Payloads

Crusoe says the JSON body "varies by event type", and the documented example has
no `type` field. The handler reads `type` / `event_type` if present, otherwise
recognises the remediation payload by `workflow_type` + `resource_id`, and logs
the field names of anything else so you can add handlers once you've seen real
budget, organization or Managed AI payloads.
