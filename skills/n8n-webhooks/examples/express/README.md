# n8n Webhooks - Express Example

Minimal example of receiving requests from an n8n **HTTP Request** node, authenticated
with a shared secret (Header auth, Bearer auth or Basic auth).

n8n does not sign requests, so there is no HMAC signature to verify. The handler compares
the credential header against your configured secret with a constant-time comparison.

## Prerequisites

- Node.js 18+
- An n8n workflow with an HTTP Request node (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `N8N_WEBHOOK_SECRET` to a long random value (`openssl rand -hex 32`) and use the
   same value in the n8n credential: the **Value** of a Header auth credential named
   `X-Webhook-Secret`, or the **Bearer Token** of a Bearer auth credential. To use Basic
   auth instead, set `N8N_BASIC_AUTH_USER` and `N8N_BASIC_AUTH_PASSWORD`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/n8n`.

## Test

```bash
npm test
```

The tests send requests with each credential type (correct, wrong and missing) and check
the event dispatch. No n8n instance is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/n8n \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $N8N_WEBHOOK_SECRET" \
  -d '{"event":"order.created","id":"exec_1042","data":{"order_id":"ord_123"}}'
```

## Receive Requests from n8n Locally

n8n Cloud can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 n8n --path /webhooks/n8n
```

Put the printed URL in the HTTP Request node's **URL** field and run the workflow.

## How It Works

- `src/index.js`: `verifyN8nRequest()` plus the `POST /webhooks/n8n` route

1. The request is authenticated before the body is parsed: Header auth
   (`X-Webhook-Secret`, configurable with `N8N_WEBHOOK_HEADER`), `Authorization: Bearer`, or
   `Authorization: Basic`. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `event` field that your workflow includes in the body
   (`lead.created`, `order.created`, `workflow.completed`, `workflow.failed`). These names
   are a convention for this example: n8n has no built-in event types.
4. It returns `200 {"received": true}`. Any non-2xx response makes the HTTP Request node
   fail, which stops the workflow unless the node's error handling says otherwise.
