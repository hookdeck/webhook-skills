# Setting Up Invoice Ninja Webhooks

## Prerequisites

- An Invoice Ninja account (hosted or self-hosted) with permission to manage account settings
- A public HTTPS URL for your endpoint (use the Hookdeck CLI for local development)

## Choose a Secret Header

Invoice Ninja does not sign requests, so you add a secret header yourself:

1. Pick a header name, for example `X-Webhook-Secret` (or `Authorization`, the default in the examples).
2. Generate a long random value, for example `openssl rand -hex 32`.
3. Store the name in `INVOICE_NINJA_WEBHOOK_HEADER` and the exact value in
   `INVOICE_NINJA_WEBHOOK_SECRET`. If you type `Bearer abc123` into Invoice Ninja, the env var
   must be `Bearer abc123`: the whole value is compared.

## Register Your Endpoint

1. In Invoice Ninja go to **Settings → Account Management → Webhooks** (the menu path can differ
   slightly between versions and between the admin portal and the legacy UI).
2. Add a webhook:
   - **Target URL:** your endpoint, for example `https://example.com/webhooks/invoice-ninja?event=create_invoice`
   - **Event:** one event, such as `create_invoice`, `create_payment` or `update_client`
   - **Method:** `POST` (default) or `PUT`, the only two values Invoice Ninja accepts; the examples handle both
   - **Headers:** add the key/value pair from the previous step
3. Repeat for each event. A subscription has exactly one event, and the event is not in the body,
   so give each subscription its own `?event=` value or its own URL.

## Test

Trigger the event in Invoice Ninja (create an invoice, record a payment, edit a client) and check
the delivery in your handler's logs or the Hookdeck CLI UI. Webhook outcomes are also recorded in
Invoice Ninja's system log.

## If the Subscription Disappears

Invoice Ninja deletes a subscription when your endpoint answers `404`, `405` or `410`. Check your
route, method handling and any proxy rules, then re-create the webhook.
