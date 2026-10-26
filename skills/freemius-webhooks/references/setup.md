# Setting Up Freemius Webhooks

## Prerequisites

- A Freemius account with a product in the Developer Dashboard
- Your application's public HTTPS webhook endpoint URL (use `npx hookdeck-cli listen 3000 freemius --path /webhooks/freemius` for local development)

## Get Your Secret Key

Freemius signs every webhook with your **product's secret key**, not a per-webhook signing secret.

1. Open your product in the Freemius Developer Dashboard.
2. Go to **Settings > API & Keys**.
3. Copy the product **Secret Key** into `FREEMIUS_WEBHOOK_SECRET`.

There is one key per product, shared by all of that product's webhooks. Use it exactly as shown, as the HMAC key string (UTF-8). Keep it server-side only.

## Register Your Endpoint

1. In the Developer Dashboard, go to **Webhooks** and open **Listeners**.
2. Click **Add Webhook**.
3. Enter your **Callback URL**.
4. Choose whether to receive **all event types** or **specific ones**. Good starting points: `license.activated`, `license.cancelled`, `subscription.created`, `subscription.cancelled`, `payment.created`, `payment.refund`.
5. Choose to make the webhook active now or deactivate it for a future time.

The webhook can be edited later to change the URL and other options.

## Inspect Events

**Webhooks > Events** in the Developer Dashboard logs each event. Filter by `event.type`, copy an event id and fetch it through the Freemius API to see the payload schema your handler will receive. The API schema lists each event's state (processed, pending, canceled, error).

## Delivery

Freemius's documentation does not publish a retry schedule, request timeout or success status code. Respond with a `2xx` quickly, do slow work asynchronously, and make your handler idempotent.

## Test Mode vs Live Mode

The documentation does not describe a separate test mode for webhooks. Use a staging product (with its own secret key) for testing, and remember the key is per product.
