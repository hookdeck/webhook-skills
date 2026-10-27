# Setting Up Thinkific Webhooks

## Prerequisites

- A Thinkific site with permission to manage webhooks (admin UI, or API access)
- A public HTTPS URL for your endpoint (use `npx hookdeck-cli listen 3000 thinkific --path /webhooks/thinkific` locally)

## Which Secret Signs My Webhooks?

Thinkific signs each request with a secret that depends on how the webhook was created:

1. **Signing secret:** under **Signing Secret** in the admin UI, enter your own secret (at least 16
   characters) or click **Generate**. Copy it when it is shown. This feature was still being rolled
   out to all sites.
2. **Site API key:** webhooks created with an API key (older webhooks) are signed with it.
3. **App client secret:** webhooks an OAuth app created are signed with the app's client secret.

Set `THINKIFIC_WEBHOOK_SECRET` to that value. It is used as UTF-8 bytes, as-is.

## Register Your Endpoint

1. Create a webhook for each topic you want, either in the Thinkific admin UI or through the
   Webhooks API (`resource.action`, for example `order.created`, `enrollment.completed`,
   `user.signup`).
2. Set the target URL to your endpoint (`/webhooks/thinkific` in the examples).
3. Add the signing secret if the UI offers it.

## Using Hookdeck

Hookdeck's Thinkific source verifies `X-Thinkific-Hmac-Sha256` (HMAC-SHA256, hex) and POSTs. When
Hookdeck asks for the secret:

> Paste the webhook's signing secret. Older webhooks are signed with the site API key, and OAuth app webhooks with the app client secret.

Use the Hookdeck source URL as the webhook URL in Thinkific.

## Testing

Create a webhook for a topic you can trigger (for example `user.signup`), or send a request by
hand with a computed signature (see the example READMEs). Check the delivery logs in Thinkific
(kept 30 days) if nothing arrives.
