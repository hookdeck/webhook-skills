# Drata Webhooks - Express Example

Minimal example of receiving Drata workflow webhooks (the **Send webhook** step)
and authenticating them with a shared-secret custom header.

> **Drata doesn't document a webhook signature.** Its help center mentions Svix
> but lists no `svix-*` headers and no `whsec_` secret. You add a secret header
> to the workflow step yourself (`X-Webhook-Secret: <hex>`) and this example
> compares it in constant time before reading the body. The payload is flat
> JSON with an `event_type` such as `CONTROL_EVIDENCE_LINKED`.

## What This Example Shows

- `src/index.js`: an Express app with `express.raw({ type: '*/*' })` on `POST /webhooks/drata`.
- A constant-time check of the custom header (name from `DRATA_WEBHOOK_HEADER`,
  default `X-Webhook-Secret`), run before the body is parsed. It fails closed:
  with `DRATA_WEBHOOK_SECRET` unset, every request gets a `500`.
- `401` for a missing or wrong secret, `400` for invalid JSON or a missing
  `event_type`, `200` (logged) for an `event_type` it doesn't handle.
- Dispatch on the 16 documented control `event_type` values, plus a dedupe key
  (`event_type` + `control_id` + `timestamp`), because Drata retries failed
  steps up to three times and sends no delivery ID.

## Prerequisites

- Node.js 18+
- A Drata account with the Admin or Workspace Manager role (**Settings → Workflows**)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret and set it as `DRATA_WEBHOOK_SECRET` in `.env`:
   ```bash
   openssl rand -hex 32
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000, with the webhook endpoint at
`POST /webhooks/drata`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 drata --path /webhooks/drata
```

No account required. Paste the URL it prints into a Drata workflow:

1. **Settings → Workflows → Create Workflow**, choose **Control**, and pick a
   trigger such as *Evidence linked*.
2. Add a **Send webhook** step and paste the Hookdeck URL.
3. Add the custom header `X-Webhook-Secret: <your secret>`.
4. Select the properties to include (at least `control_id` and `control_code`).
5. Publish the workflow, then link evidence to a control it covers.

## Test

```bash
npm test
```

Or send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/drata \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $DRATA_WEBHOOK_SECRET" \
  -d '{"event_type":"CONTROL_EVIDENCE_LINKED","timestamp":"2026-10-21T09:30:00.000Z","control_id":42,"control_code":"DCF-101","evidence_name":"Q3 access review"}'
```
