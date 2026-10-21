# Setting Up Modern Treasury Webhooks

## Prerequisites

- A Modern Treasury account with access to Developer settings
- Your application's webhook endpoint URL (HTTPS required in production)

## How Do I Get My Webhook Key?

1. Log in to the [Modern Treasury dashboard](https://app.moderntreasury.com)
2. Go to Developers > [Webhooks](https://app.moderntreasury.com/developers/webhooks)
3. Copy the webhook key and store it as `MODERN_TREASURY_WEBHOOK_KEY`

Use it exactly as shown: it is the HMAC key as a raw string. If it is ever exposed, contact Modern Treasury support; they rotate it and coordinate the change with you.

## How Do I Register an Endpoint?

1. In Developers > Webhooks, click **Create Webhook Endpoint**
2. Enter your endpoint URL. Use a hard-to-guess URL. Production URLs must be `https://`
3. Optionally configure authentication credentials if your endpoint requires them
4. Choose **all events** or select specific event types
5. Save. The endpoint is enabled immediately

For local development, run `npx hookdeck-cli listen 3000 modern-treasury --path /webhooks/modern-treasury` and paste the URL it prints. Sandbox also accepts `localhost` / `127.0.0.1` URLs directly.

## Test Mode vs Live Mode

- Endpoints belong to the environment you are logged in to (sandbox vs production); you can only add endpoints for the current environment.
- Sandbox allows up to 3 endpoints and is rate limited to 300 deliveries per minute across them.
- To share one URL between live and test, branch on the `X-Live-Mode` header (`true` / `false`).
- Use [Resend a webhook](https://docs.moderntreasury.com/platform/docs/resend-a-webhook) to replay a past event, and the delivery logs on the endpoint page to debug failures.

## Optional: IP Allowlist

Modern Treasury publishes the IP addresses it sends from ([IP Addresses](https://docs.moderntreasury.com/platform/reference/ip-addresses)). Allowlisting them is an extra layer on top of signature verification, not a replacement.

## Failure Notifications

Subscribe your team to webhook endpoint failure notifications in Settings. An endpoint is paused after an event exhausts all 15 delivery attempts.
