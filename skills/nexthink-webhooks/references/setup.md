# Setting Up Nexthink Webhooks

## Prerequisites

- Central administrative privileges and the Integrations module in Nexthink
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

## Setup Note (same as in Hookdeck)

Choose the Bearer token credential type for the webhook and paste the whole Authorization
value here, including "Bearer ".

Basic and OAuth credential types are not covered by Hookdeck's Nexthink source (`NEXTHINK`).

## Create the Connector Credential

1. Go to **Administration > Connector credentials** (ask Nexthink Support to enable it if the
   menu entry is hidden).
2. Click **New credential**, enter a **Name** and choose protocol **HTTPS**.
3. Set the **URL address** to your endpoint's base, in the form `https://{host}:{port}/`.
4. Set **Authorization type** to **Bearer token**.
5. Set the **Header prefix** manually (usually `Bearer`) and enter the **Token**.
6. Store the **whole header value** as `NEXTHINK_AUTHORIZATION`, for example
   `Bearer your-token`. Include the prefix exactly as Nexthink sends it.

## Create the Webhook

1. Go to **Administration > Outbound connectors > Webhooks** and click **New webhook**.
2. Set **Name**, **Description**, **NQL conditions** and the **Credentials** you just created.
3. Choose the **Request method**: POST, PUT or PATCH.
4. Set **Resource** to the path on your server, for example `webhooks/nexthink`.
5. Write the **Payload** (JSON only), for example
   `{ "event": "alert triggered", "monitor": "{{alert.monitor.name}}" }`.
6. Use **Send Test** to check credentials, method and payload. Placeholders are not
   substituted in tests.
7. Make sure the webhook is **Active**.

## Using Hookdeck

Hookdeck's Nexthink source pre-selects POST without managing the method. The method is the
sender's choice, so if your webhook uses PUT or PATCH, also allow that method on the source.
Point the credential's URL (plus the webhook Resource) at the Hookdeck source URL.

## Local Testing

```bash
npx hookdeck-cli listen 3000 nexthink --path /webhooks/nexthink
```

Use the printed URL as the credential URL. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/nexthink \
  -H "Content-Type: application/json" \
  -H "Authorization: $NEXTHINK_AUTHORIZATION" \
  -d '{"event":"alert triggered","monitor":"High CPU (illustrative)"}'
```
