# Setting Up Stigg Webhooks

## Prerequisites

- A Stigg account with access to Settings > Integrations
- A public HTTPS endpoint for your handler (use the Hookdeck CLI tunnel for local development)

## Register Your Endpoint

1. In Stigg, go to **Settings > Integrations > Webhooks** and click **+ New webhook**.
2. Enter a **Service name** (a label for the receiver) and the **Endpoint URL**, e.g. `https://your-domain.com/webhooks/stigg`.
3. Choose **Events to send**. A good starting set: `customer.created`, `customer.updated`, `subscription.created`, `subscription.updated`, `subscription.canceled`, `entitlements.updated`.
4. Click **Add**. The webhook is active immediately.

## Get Your Webhook Secret

Open the webhook's row to see its details page. Stigg shows the webhook secret there. Copy it into `STIGG_WEBHOOK_SECRET` on your server. Stigg sends the same value in the `Stigg-Webhooks-Secret` header of every event.

## Send a Test Event

On the webhook's events list, open the dotted menu on an event, choose **Send test event**, and confirm. The modal shows the request body and your endpoint's response.

## Editing and Disabling

You can edit the endpoint URL, description and event list at any time. Disabling a webhook stops delivery, and events missed while it was disabled can't be replayed.

## Allowlisting

Webhooks may originate from `18.119.35.43`. Stigg says the list may change and that it will notify you.
