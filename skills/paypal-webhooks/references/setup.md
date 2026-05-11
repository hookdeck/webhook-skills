# Setting Up PayPal Webhooks

## Prerequisites

- A PayPal Business account (or PayPal Developer sandbox account)
- A REST app created at <https://developer.paypal.com/dashboard/applications>
- An HTTPS webhook endpoint URL on your server (use [Hookdeck CLI](https://hookdeck.com/docs/cli) for local development)

## Create a REST App

1. Sign in at <https://developer.paypal.com/dashboard/applications>.
2. Toggle between **Sandbox** and **Live** in the top-right — webhooks are
   scoped per environment.
3. Click **Create App**, give it a name, choose **Merchant**, then **Create**.
4. Note the **Client ID** and **Secret**. These are only required if you plan
   to call the postback `verify-webhook-signature` endpoint or any other
   PayPal REST API.

## Register a Webhook

1. Open the app and scroll to **Sandbox/Live Webhooks**.
2. Click **Add Webhook**.
3. Enter your endpoint URL — must be HTTPS (`https://yourdomain.com/webhooks/paypal`).
4. Select the **Event types** you want to receive. Recommended starter set:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.REFUNDED`
   - `PAYMENT.CAPTURE.DENIED`
   - `CHECKOUT.ORDER.APPROVED`
   - `BILLING.SUBSCRIPTION.CREATED`
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `CUSTOMER.DISPUTE.CREATED`
5. Click **Save**.

## Get the Webhook ID

After saving, PayPal shows the webhook in the list with an **ID** column
(looks like `4JH86294D6297351H`). This is your `PAYPAL_WEBHOOK_ID` — store it
as an environment variable. **It is required for signature verification** —
both the postback API and the offline self-verify path use it.

Sandbox and Live webhooks have different IDs. Keep them in separate env vars
or scope them by `PAYPAL_ENV`.

## Required Environment Variables

```bash
# Identifier of the webhook you registered (per-environment)
PAYPAL_WEBHOOK_ID=4JH86294D6297351H

# sandbox | live - controls which PayPal API base URL is trusted
PAYPAL_ENV=sandbox

# Only needed if you use the postback verify-webhook-signature endpoint
PAYPAL_CLIENT_ID=AYS...
PAYPAL_CLIENT_SECRET=EC...
```

## Test Your Webhook

### Webhook Simulator (in the dashboard)

1. Go to <https://developer.paypal.com/dashboard/webhooksSimulator>.
2. Set **Webhook URL** to your endpoint.
3. Choose an **Event type**, optionally tweak the JSON, and click **Send Test**.

> The simulator signs payloads with the matching sandbox/live cert, so your
> verification code is exercised end-to-end.

### Real Sandbox Events

Make a sandbox checkout or subscription in your app — real events fire from
the sandbox infrastructure with full signing.

### Local Development

```bash
# In one terminal, start your server
npm start
# In another, expose it
npx hookdeck-cli listen 3000 paypal --path /webhooks/paypal
```

Set the printed Hookdeck URL as your webhook URL in the PayPal dashboard.

## Test Mode vs. Live Mode

- Sandbox certs are served from `api.sandbox.paypal.com`.
- Live certs are served from `api.paypal.com`.
- Both hosts end in `.paypal.com`, which is the only string your verifier
  should accept (see [verification.md](verification.md) — host validation is a
  critical security check).
- Your `PAYPAL_WEBHOOK_ID` is environment-specific. Mixing a sandbox webhook ID
  with a live event (or vice versa) will fail verification silently.
