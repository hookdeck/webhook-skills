# Setting Up Maxio Webhooks

## Prerequisites

- A Maxio (Chargify) site with permission to manage webhook settings
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 maxio --path /webhooks/maxio` locally)

## Get Your Signing Key

Maxio signs each delivery with your **Site Shared Key**. Find it in the Maxio admin under the site's integration/webhook settings (see the [official guide](https://support.maxio.com/hc/en-us/articles/24266136649869-Webhooks-Configuration-and-Testing); menu names may vary by plan). Use it as a **raw string** — do not base64-decode it. Store it as `MAXIO_SHARED_KEY`.

## Register Your Endpoint

1. In Maxio, open the site's webhook settings and add your endpoint URL (e.g. `https://example.com/webhooks/maxio`).
2. Select the events to receive: `signup_success`, `payment_success`, `payment_failure`, `renewal_success`, `subscription_state_change`.
3. Save, then send a `test` event from the UI.

## Testing

The `test` event sends a form body like `payload[chargify]=testing&event=test`. Your handler should verify it and return `200`.
