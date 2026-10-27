# Setting Up Tidio Webhooks

## Prerequisites

- A Tidio project on the **Plus** or **Premium** plan (webhooks are not available on other plans)
- Project **owner** or **admin** permissions (the Webhooks section is limited to them)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 tidio --path /webhooks/tidio` for local development)

## Register Your Endpoint

1. In the Tidio panel, go to **Settings > Developer > Webhooks**.
2. Add your first webhook and paste your **endpoint URL** (for example `https://your-app.example.com/webhooks/tidio`).
3. Choose or create a **stack**. Stacks group endpoints so you can manage them together; the first webhook requires creating a new stack.
4. Select the **events** (topics) that should trigger the webhook.
5. Save. The stack lists the selected events and lets you pause, edit, or delete the webhook. Choose **Edit** to add or remove events.

## Get Your Signing Secret

Tidio generates a webhook secret for signing. Copy it from the webhook settings and store it as
`TIDIO_WEBHOOK_SECRET`. The secret is used as-is (its UTF-8 bytes), not decoded. There can be several
secrets; Tidio then sends one `s=` signature per secret in `x-tidio-signature`, and a request is valid when any
one matches.

## Test Mode vs Live Mode

Tidio does not document a separate test mode. Trigger a real event (for example create a contact in the panel, or mark a
conversation as solved) to receive a delivery. Webhooks are not sent for changes made through the OpenAPI.

## Check Delivery

Tidio documents a "Webhooks statistics and history" page in the panel for reviewing deliveries. Failed
deliveries (non-2xx, timeout over 4 seconds, connection error) are retried 9 times over about 4 h 45 min.
