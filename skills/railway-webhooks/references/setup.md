# Setting Up Railway Webhooks

## Prerequisites

- A Railway project you can edit
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 railway --path /webhooks/railway` locally)

## Choose a Secret

Railway does not sign webhooks, so generate a long random token and store it in your
application's secret store:

```bash
openssl rand -hex 32
```

Decide the header it travels in. Railway's docs suggest `Authorization: Bearer <token>` or an
`X-Webhook-Secret` header. The header name is your choice, with these limits: letters, digits,
`-` and `_`, up to 128 characters; values up to 4096 characters with no line breaks. Railway
refuses `Host`, `Content-Type`, `Content-Length`, hop-by-hop headers (`Transfer-Encoding`,
`Connection`, `Keep-Alive`, `Upgrade`, `TE`, `Trailer`, `Expect`) and anything starting with
`Proxy-` or `X-Railway-`.

## Register Your Endpoint

1. Open the project in Railway and click **Settings** (top right).
2. Go to the **Webhooks** tab.
3. Enter your webhook URL (e.g. `https://example.com/webhooks/railway`).
4. Under **Custom headers**, add a row: the header name (e.g. `X-Webhook-Secret`) and its value
   (e.g. the token, or `Bearer <token>` if you use `Authorization`). Up to 20 headers are allowed.
5. Optional: pick the events to receive.
6. Click **Save Webhook**.

Header values are stored encrypted and are **never shown again**; after saving, the row shows
the name with an "Unchanged" placeholder. Leave the value empty to keep it, type a new one to
replace it.

## Configure Your Receiver

Set the two environment variables to match what you typed:

```bash
RAILWAY_WEBHOOK_HEADER=X-Webhook-Secret
RAILWAY_WEBHOOK_SECRET=<the exact value you entered>
```

If you entered `Bearer abc123` as the value, `RAILWAY_WEBHOOK_SECRET` is `Bearer abc123`, prefix
included.

## Test

Click **Test Webhook** in the form. Railway sends a sample payload, including the custom headers,
from its own servers and shows the status your endpoint returned (10-second timeout). Or replay
with curl:

```bash
curl -X POST http://localhost:3000/webhooks/railway \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $RAILWAY_WEBHOOK_SECRET" \
  -d '{"type":"Deployment.failed","details":{"id":"1"},"resource":{},"severity":"WARNING","timestamp":"2025-11-21T23:48:42.311Z"}'
```

## Alternatives

If your receiver can't read headers, Railway's docs mention a hard-to-guess path segment or
query parameter in the URL, but URLs tend to end up in access logs. Prefer the header.
Header values can also be set through Railway's MCP server (`create-webhook`, `update-webhook`,
`test-webhook`) and the public API.
