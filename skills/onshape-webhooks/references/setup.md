# Setting Up Onshape Webhooks

## Prerequisites

- An Onshape account and an application (API key or OAuth) that can call the REST API
- For signed webhooks: a company administrator with access to Company/Classroom/Enterprise settings
- Your application's webhook endpoint URL (HTTPS with a CA-signed certificate)

## Get Your Signing Secret

> Onshape signature keys are an Enterprise company setting. Paste the primary key; only the primary signature is verified.

1. Click your account icon > **Company/Classroom/Enterprise settings** > **Webhooks**.
2. Under **Webhook signatures**, generate a primary key (and optionally a secondary key for rotation). Onshape accepts either; this skill verifies the **primary** header only.
3. Click **Save changes**, then copy the primary key into `ONSHAPE_WEBHOOK_SECRET`.
4. Optionally enable webhook basic authentication, which fills the `Authorization` header on every request. It is separate from signing and not covered here.

## Register Your Endpoint

Call `POST https://cad.onshape.com/api/v6/webhooks` (Enterprise accounts use their company domain):

```json
{
  "companyId": "000000000000000000000000",
  "events": ["onshape.model.lifecycle.changed"],
  "options": { "collapseEvents": false },
  "url": "https://your-endpoint.example.com/webhooks/onshape"
}
```

- Use `companyId` (from `findCompany`, the `id` field) or a `documentId` owned by the company.
- Set `isTransient=false` to avoid automatic clean-up after inactivity.
- Registration sends a trial notification (`webhook.register`, and a `webhook.ping` validation). Your endpoint only needs to return HTTP 200 for it, and it is signed like any other delivery when a key is set.

## Test Mode vs Live Mode

There is no separate test mode. Call the `pingWebhook` endpoint (`POST /api/v6/webhooks/{webhookId}/ping`) to send a `webhook.ping`, and locally use `npx hookdeck-cli listen 3000 onshape --path /webhooks/onshape`.
