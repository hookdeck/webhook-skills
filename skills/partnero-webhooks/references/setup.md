# Setting Up Partnero Webhooks

## Prerequisites

- A Partnero program you can edit
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 partnero --path /webhooks/partnero` for local development)

## Register Your Endpoint

1. In Partnero go to **Program Settings > Webhooks**.
2. Click **Add Webhook**.
3. Enter your endpoint URL.
4. Select the events to receive (for example `partner.created`, `transaction.created`, `reward.approved`).
5. Save and **copy the signing secret**.

You can also manage webhooks programmatically with the Webhooks API; the response includes the
webhook's `signature` value, which is the signing secret.

## Get Your Signing Secret

The signing secret is the `signature` value shown when you create the webhook (also returned by the
Webhooks API). Store it as `PARTNERO_WEBHOOK_SECRET` and use it as-is, as UTF-8 bytes. It is not
hex- or base64-decoded.

## Test a Webhook

1. Go to **Program Settings > Webhooks**.
2. Find your webhook and click **Test**.
3. Select an event type and click **Send Test Webhook**.

Check the webhook logs in the Partnero dashboard if deliveries do not arrive.
