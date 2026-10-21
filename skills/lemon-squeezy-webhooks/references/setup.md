# Setting Up Lemon Squeezy Webhooks

## Prerequisites

- Lemon Squeezy account with access to store settings
- Your application's public webhook endpoint URL (use a tunnel locally)

## Choose Your Signing Secret

Unlike many providers, Lemon Squeezy does not generate the secret for you. You enter it when creating the webhook.

1. Generate a random string between 6 and 40 characters (for example `openssl rand -hex 16`).
2. Store it as `LEMON_SQUEEZY_SIGNING_SECRET` in your application.
3. Enter the same string as the **Signing secret** when creating the webhook.

The secret is used as a raw string, not base64-decoded.

## Register Your Endpoint

1. Go to **Settings > Webhooks** in the Lemon Squeezy dashboard.
2. Add a webhook and enter:
   - **Callback URL**: for example `https://example.com/webhooks/lemon-squeezy`
   - **Signing secret**: the string from above
   - **Events**: the events to receive
3. Recommended events: `order_created`, `order_refunded`, `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_payment_success`, `license_key_created`.

Webhooks can also be created through the Lemon Squeezy API.

## Passing Your Own Data (`custom_data`)

Attach data such as your user ID to checkout, and it comes back in `meta.custom_data` on order, subscription and license key events. See the Passing custom data section of the Lemon Squeezy help docs.

## Test Mode vs Live Mode

Lemon Squeezy has a test mode for placing orders with test cards; payloads for those carry `test_mode: true` in the attributes. Recent deliveries (with full payloads and a resend button) are listed on the webhooks settings page, and you can use **Simulate webhook event** to send a sample.

## Local Development

```bash
npx hookdeck-cli listen 3000 lemon-squeezy --path /webhooks/lemon-squeezy
```

Use the URL it prints as the Callback URL. No account required.
