# Setting Up Builder.io Webhooks

## Prerequisites

- A Builder.io space where you can edit models
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 builder-io --path /webhooks/builder-io` locally)

## Register Your Endpoint

1. In Builder.io, go to **Models** and choose the model to watch.
2. Open the **Advanced** tab.
3. Click **Edit** next to **Webhooks**.
4. Click **+ Webhook** and enter the URL Builder should POST to, for example
   `https://example.com/webhooks/builder-io`.
5. Click **Done**.

Builder POSTs to the URL whenever content is published, unpublished, archived or deleted.

## Add the Secret Header

Builder.io doesn't sign requests, so add a secret header the endpoint can check:

1. In the webhook entry, click **+ Custom Header**.
2. Set a **name** (for example `Authorization` or `X-Builder-Secret`) and a **value** (a long
   random string).
3. Store the same name and the **exact whole value** in your environment:

```bash
BUILDER_IO_WEBHOOK_HEADER=X-Builder-Secret
BUILDER_IO_WEBHOOK_SECRET=<the value you typed>
```

If you typed `Bearer abc123` as the value, `BUILDER_IO_WEBHOOK_SECRET` is `Bearer abc123`. The
examples compare the whole value and don't strip a `Bearer ` prefix. Custom headers are set per
webhook, so repeat this for every webhook (and every model) pointing at your endpoint.

## Advanced Settings

The **Show Advanced** dropdown on a webhook offers:

- **Disable proxy**: Builder calls your URL straight from the browser instead of its backend. Only
  for local development (such as `localhost`); your API must return CORS headers.
- **Disable payload**: sends the POST without any data.
- **Submit limited payload fields**: includes only fields you list, in dot notation (for example
  `data.myInput`).

Leave the proxy on in production so the secret header is sent from Builder's backend.

## Test

Publish an entry in the model and check your endpoint logs a `publish` operation. Or replay with
curl:

```bash
curl -X POST http://localhost:3000/webhooks/builder-io \
  -H "Content-Type: application/json" \
  -H "$BUILDER_IO_WEBHOOK_HEADER: $BUILDER_IO_WEBHOOK_SECRET" \
  -d '{"operation":"publish","modelName":"page","newValue":{"id":"cs3df","name":"My great page"},"previousValue":null}'
```
