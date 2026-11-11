# Setting Up Maxio Webhooks

## Prerequisites

- A Maxio (Chargify) site with permission to manage webhook settings
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 maxio --path /webhooks/maxio` locally)

## Get Your Signing Key

Maxio signs each delivery with your **Site Shared Key**. To find it, open the site switcher at the top of the left navigation, select **Edit Current Site**, and copy the **Shared Key** field (see [Finding your Site shared key](https://docs.maxio.com/configuration/advanced-billing/webhooks/configure-and-test-webhooks#finding-your-site-shared-key)). Each site has its own key. Use it as a **raw string** — do not base64-decode it. Store it as `MAXIO_SHARED_KEY`.

## Register Your Endpoint

1. In Maxio, go to **Config > Settings > Webhooks**, select **Send webhooks to your webhook endpoints**, click **Add New Endpoint** and enter your endpoint URL (e.g. `https://example.com/webhooks/maxio`).
2. Select the events to receive: `signup_success`, `payment_success`, `payment_failure`, `renewal_success`, `subscription_state_change`.
3. Save, then send a `test` event from the UI.

## Testing

Choosing **Test** from an endpoint's **Actions** drop-down sends `id=123456&event=test&payload[chargify]=testing`. Your handler should verify it and return `200`. To see a real event's structure, use **Tools > Webhook Testing**, which sends dummy data shaped like the event you choose.
