# Setting Up Coinbase Commerce Webhooks

## Prerequisites

- A [Coinbase Commerce](https://commerce.coinbase.com/) account
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/coinbase-commerce`)

## Register Your Endpoint

1. Sign in to the [Coinbase Commerce dashboard](https://commerce.coinbase.com/).
2. Go to **Settings → Notifications** (webhook subscriptions live here).
3. Under **Webhook subscriptions**, click **Add an endpoint**.
4. Enter your endpoint URL and save.

Coinbase Commerce sends **all** charge events to every endpoint — there is no
per-event subscription toggle. Your handler should switch on the event `type`
and ignore the events you don't care about.

## Get Your Shared Secret

1. Still under **Settings → Notifications**, find the **Shared Secret** section.
2. Click **Show shared secret** (or **Generate**/**Reset** if none exists).
3. Copy the value and store it as an environment variable:

   ```bash
   COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_shared_secret
   ```

The shared secret is used as the HMAC-SHA256 key to verify the
`X-CC-Webhook-Signature` header. Treat it like a password — never commit it.

## Test Your Endpoint

- Create a test charge from the dashboard (or via the Commerce API) and complete
  a payment to trigger `charge:created`, `charge:pending`, and `charge:confirmed`
  events.
- For local development, use the Hookdeck CLI to tunnel public webhook traffic to
  your machine (no account required):

  ```bash
  npx hookdeck-cli listen 3000 coinbase-commerce --path /webhooks/coinbase-commerce
  ```

  Point your Coinbase Commerce endpoint URL at the public URL the CLI prints.

## Retries

Coinbase Commerce retries failed webhook deliveries with exponential backoff.
Return a `2xx` status quickly (do heavy work asynchronously) and make your
handler **idempotent** using the event `id`, since the same event may be
delivered more than once.
