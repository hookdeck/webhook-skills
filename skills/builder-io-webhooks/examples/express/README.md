# Builder.io Webhooks - Express Example

Minimal example of receiving Builder.io webhooks and authenticating them with a secret custom
header.

Builder.io does not sign payloads, so there is no HMAC to verify. You add a custom header to the
webhook; the handler compares that header's whole value with your stored secret using a
constant-time comparison. The route reads the body with `express.raw({ type: '*/*' })`, so any
content type works, and parses JSON only after the check.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Builder.io model with a webhook and a custom header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BUILDER_IO_WEBHOOK_HEADER` to the custom header name and `BUILDER_IO_WEBHOOK_SECRET` to its
   exact whole value (including any `Bearer ` prefix you typed).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/builder-io`.

## Test

```bash
npm test
```

The tests send every documented operation with correct, wrong and missing header values. No
Builder.io account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/builder-io \
  -H "Content-Type: application/json" \
  -H "$BUILDER_IO_WEBHOOK_HEADER: $BUILDER_IO_WEBHOOK_SECRET" \
  -d '{"operation":"publish","modelName":"page","newValue":{"id":"cs3df","name":"My great page"},"previousValue":null}'
```

## Receive Webhooks Locally

Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 builder-io --path /webhooks/builder-io
```

Put the printed URL in the model's webhook, and add the custom header there.

## How It Works

- `src/index.js`: `verifyBuilderRequest()` plus the `POST /webhooks/builder-io` route

1. The configured header is looked up case-insensitively and its whole value compared before the
   body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `operation`: `publish`, `unpublish`, `archive`, `delete`,
   `scheduledStart`, `scheduledEnd`.
4. It returns `200 {"received": true}`.
