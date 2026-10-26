# Vellum Webhooks - Express Example

Minimal example of receiving Vellum Monitoring webhooks and authenticating them with a shared
header credential.

Vellum's webhooks are unsigned by default. This example does **not** verify Vellum's optional HMAC
signature (`X-Vellum-Timestamp` / `X-Vellum-Signature`). It compares the header you configured
(API Key Header, or Bearer Token in `Authorization`) with your stored secret in constant time.
The route accepts GET, POST, PUT, PATCH and DELETE (Vellum's docs don't name the method) and reads
the body with `express.raw({ type: '*/*' })`, so any content type works.

## Prerequisites

- Node.js 18+
- A Vellum organization with the Webhook Integration (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `VELLUM_WEBHOOK_HEADER` (header name, default `Authorization`) and `VELLUM_WEBHOOK_SECRET`
   (the exact, whole header value, including any `Bearer ` prefix you typed in Vellum).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and handles `/webhooks/vellum`.

## Test

```bash
npm test
```

The tests cover every documented event, every HTTP method, empty bodies, and correct, wrong and
missing credentials. No Vellum account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/vellum \
  -H "Content-Type: application/json" \
  -H "Authorization: $VELLUM_WEBHOOK_SECRET" \
  -d '{"id":"1","name":"workflow.execution.fulfilled","body":{}}'
```

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 vellum --path /webhooks/vellum
```

Put the printed URL in the Vellum Webhook Integration. The source's authentication must match
the header you configure (see setup).

## How It Works

- `src/index.js`: `verifyVellumRequest()` plus the `/webhooks/vellum` route

1. The credential header is checked first, for every method. Failure returns `401`.
2. An empty body returns `200`; otherwise the body must be a JSON object (`400` otherwise).
3. Events are deduped on `id`, then dispatched on `name`: `workflow.execution.initiated`,
   `workflow.execution.fulfilled`, `workflow.execution.rejected`,
   `workflow_execution.usage_calculation.fulfilled`, `workflow_execution.usage_calculation.rejected`,
   `metric.execution.fulfilled`.
4. It returns `200 {"received": true}`.

A static credential authenticates the sender, not the body, and gives no replay protection. Use
HTTPS and rotate the credential if it leaks.
