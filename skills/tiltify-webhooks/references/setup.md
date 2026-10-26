# Setting Up Tiltify Webhooks

## Prerequisites

- A Tiltify account and a Tiltify Application (see the [Tiltify developer docs](https://developers.tiltify.com/docs/webhooks/create-an-endpoint))
- A public HTTPS URL for your handler. Tiltify can't deliver to `localhost`, so use a tunnel such as `npx hookdeck-cli listen 3000 tiltify --path /webhooks/tiltify` while developing.

## Register the Endpoint

1. Open your Application in the Tiltify Developer Dashboard and choose **Webhooks** in the sidebar.
2. Click **Add Webhook**.
3. Set the **Endpoint URL** (for example `https://example.com/webhooks/tiltify`) and an optional **Description** (private, for your own use).

## Get Your Signing Secret

Open the Webhook Endpoint's **Overview** page. It shows the **Secret Webhook Signing Key**, a 64-character hex string. Put it in `TILTIFY_WEBHOOK_SECRET` **as-is**: Tiltify uses it as UTF-8 text for the HMAC key, so don't hex-decode it.

## Subscribe to Events

1. On the endpoint's page, open the tab for **Webhook Subscriptions**.
2. Enter the fact's id. You'll find it in the Campaign Dashboard under **Setup > Information**.
3. Choose the events to receive. The options map to the event types (`public` or `private` scope, `direct` or `indirect` locality, `donation_updated` or `fact_updated`). Subscriptions can also be managed through the Tiltify API.

## Test Mode vs Live Mode

Tiltify's docs have a Testing Webhooks section, and the example payloads they show carry `subscription_source_type: "test"`. Test deliveries use the same headers and signing as real ones, so the handler needs no special case.

## Keep the Endpoint Active

Return a `2xx` for every delivery you accept, including event types you ignore. After 12 failed retries Tiltify deactivates the endpoint; re-enable it in the dashboard or through the API.
