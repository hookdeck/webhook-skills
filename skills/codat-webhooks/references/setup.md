# Setting Up Codat Webhooks

## Prerequisites

- A Codat account with access to the Codat Portal
- A public HTTPS URL for your webhook endpoint (for local development, use the Hookdeck CLI below)

## How Do I Add a Codat Webhook Endpoint?

1. In the Codat Portal, go to **Monitor > Webhooks > Events**.
2. Add an endpoint (consumer) with your URL, for example `https://your-app.com/webhooks/codat`.
3. Select the event types to subscribe to, for example `company.created`, `connection.connected`, `read.completed` and `write.successful`.
4. Save the endpoint.

See [Create a webhook consumer](https://docs.codat.io/using-the-api/webhooks/create-consumer).

## Where Do I Get the Codat Webhook Signing Secret?

In the Codat Portal, go to **Monitor > Webhooks > Events**, click the endpoint, and copy the **Signing secret** from its detailed view. It starts with `whsec_`. Store the full value, including the prefix, as `CODAT_WEBHOOK_SECRET`. Each endpoint has its own secret.

## Local Development

```bash
npx hookdeck-cli listen 3000 codat --path /webhooks/codat   # Express / Next.js
npx hookdeck-cli listen 8000 codat --path /webhooks/codat   # FastAPI
```

No account required. Add the printed URL as an endpoint in the Codat Portal, then create a company or connection to trigger `company.created` or `connection.created`.

## Custom Authorization Header and mTLS

Codat endpoints can also send a custom `Authorization` header or use mTLS. Treat these as extra layers, not a replacement for signature verification.
