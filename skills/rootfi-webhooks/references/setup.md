# Setting Up RootFi (Commenda) Webhooks

## Prerequisites

- A RootFi (Commenda integrations) account with access to the **Webhooks** page, or API access to `POST /v4/core/webhook-config`
- Your application's webhook endpoint URL (the Hookdeck source URL if you use Hookdeck)

## Get Your Signing Secret

Set a signing_key on the RootFi webhook config. Without one, deliveries are unsigned and fail verification.

RootFi does not generate the signing key. You choose it: a long random string (for example `openssl rand -hex 32`). It is used as-is, as UTF-8 bytes, for the HMAC key, so keep the exact string and store it as `ROOTFI_WEBHOOK_SECRET`. Do not hex- or base64-decode it.

## Register Your Endpoint

**Dashboard**

1. Go to **Webhooks** and click **Create Webhook**.
2. Name the webhook and choose the event type (one per webhook).
3. For **Data Model Changes**, select the topics to subscribe to.
4. Enter your endpoint URL. Optionally add custom headers, and add the signing key.

**API**

```json
POST /v4/core/webhook-config
{
  "name": "Invoice changes",
  "webhook_type": "DATA_MODEL_CHANGES",
  "url": "https://api.example.com/hooks/rootfi",
  "topics": ["invoice.create", "invoice.update"],
  "headers": [{ "name": "X-Tenant", "value": "acme" }],
  "signing_key": "<random secret>"
}
```

- Create one config for each event type you need: `DATA_MODEL_CHANGES`, `SYNC_STARTED`, `SYNC_COMPLETED`, `CONNECTION_CHANGED`, `DISCONNECT_REQUESTED`.
- Topics apply only to `DATA_MODEL_CHANGES`. Valid topics come from `GET /v4/core/webhook-config/platform-topics`. The dashboard requires at least one topic; the API does not, and an empty list matches everything.
- Existing configs can be enabled, disabled, or edited on the Webhooks page, which also shows each delivery's attempts and response codes.

## Use Hookdeck

1. Create a Hookdeck source of type **RootFi (Commenda)** and paste the same `signing_key` as the source's signing secret.
2. Use the Hookdeck source URL as the config's `url`.
3. For local development: `npx hookdeck-cli listen 3000 rootfi --path /webhooks/rootfi`

## Test Mode vs Live Mode

RootFi's webhook docs describe no separate test mode or test event. Create a config pointed at a Hookdeck or local URL, then trigger a sync on a connected company to see `SYNC_STARTED`, `DATA_MODEL_CHANGES` and `SYNC_COMPLETED` deliveries, and check the delivery log in the dashboard.
