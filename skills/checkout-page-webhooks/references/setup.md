# Setting Up Checkout Page Webhooks

## Prerequisites

- A Checkout Page account with access to store settings
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 checkout-page --path /webhooks/checkout-page` locally)

## Register Your Endpoint

1. Open Store settings > Integrations > Webhooks.
2. Add your endpoint URL (the examples listen on `/webhooks/checkout-page`). Deliveries are `POST`.
3. Choose the events to receive (for example `payment.paid`, `booking.created`, `subscription.canceled`).

Page-level webhooks (a page's After payment > Integrations) are configured separately and send a
`conversion` event instead; they are not signed with the scheme in this skill.

## Get Your Signing Secret

1. Go to Settings > Webhooks.
2. Choose View signing secret and copy it.
3. Set it as `CHECKOUT_PAGE_WEBHOOK_SECRET`. Use it as-is (its UTF-8 bytes); do not hex- or base64-decode it.

Rotating the secret takes effect immediately: the old secret stops working, and retries of earlier
events are re-signed with the new one. Deliveries rejected after a rotation are retried briefly and
then not sent again.

## Testing

Trigger a real event (for example a test payment) and inspect the delivery with the Hookdeck CLI.
