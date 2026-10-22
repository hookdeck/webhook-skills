# Toggl Track Webhooks - Next.js Example

Minimal example of receiving Toggl Track webhooks with `X-Webhook-Signature-256` verification and PING validation, using Next.js.

## Prerequisites

- Node.js 18+
- A Toggl Track workspace and an API token (profile page) to create a webhook subscription

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TOGGL_WEBHOOK_SECRET` in `.env` to the `secret` you gave the subscription (or the one Toggl generated when you omitted it).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts `POST /webhooks/toggl`.

## Test

```bash
npm test
```

Tests use the signature test vector from Toggl's docs (secret `PGuRrhCFajIyEvFlreKL`) and generate real HMAC-SHA256 signatures for entity events.

## Receive real webhooks locally

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 toggl --path /webhooks/toggl
```

Create a subscription whose `url_callback` is the tunnel URL (see [references/setup.md](../../references/setup.md)), then ping it:

```bash
curl -u {api_token}:api_token -X POST \
  https://api.track.toggl.com/webhooks/api/v1/ping/{workspace_id}/{subscription_id}
```

**Subscription validation:** a subscription must be validated before it receives real events. This handler validates synchronously by echoing `{"validation_code": "..."}` from the PING. Behind Hookdeck, the response Toggl sees is Hookdeck's, so validate asynchronously instead: copy the `validation_code` from the PING in the Hookdeck dashboard and call `GET https://api.track.toggl.com/webhooks/api/v1/validate/{workspace_id}/{subscription_id}/{validation_code}`.

## How verification works

Toggl sends `X-Webhook-Signature-256: sha256=<hex>`, the HMAC-SHA256 of the **full unparsed body** keyed with the subscription secret. The route handler reads the body with `request.text()` before parsing. The handler returns `400` for a missing or invalid signature.
