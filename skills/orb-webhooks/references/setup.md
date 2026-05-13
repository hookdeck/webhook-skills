# Setting Up Orb Webhooks

## Prerequisites

- Orb account (sandbox works for development)
- Your application's webhook endpoint URL (must be HTTPS in production)

## Register Your Endpoint

1. Open the [Orb Dashboard](https://app.withorb.com/) and navigate to **Developers → Webhooks**.
2. Click **Add endpoint**.
3. Enter your endpoint URL (e.g., `https://your-app.com/webhooks/orb`).
4. (Optional) Select **Summary webhooks** if you want the minified payload variant.
5. (Optional) Filter the events your endpoint should receive — or subscribe to all.
6. Save the endpoint.

## Get Your Signing Secret

Each Orb webhook endpoint has its **own** signing secret — distinct from your account API key.

1. In the Orb Dashboard, open the webhook endpoint you just created.
2. Reveal the **Signing secret** for that endpoint.
3. Copy the secret into your application's environment as `ORB_WEBHOOK_SECRET`.

If you rotate the secret, update `ORB_WEBHOOK_SECRET` and redeploy before the previous secret is revoked.

## Recommended Events

**Customer lifecycle:**
- `customer.created`
- `customer.credit_balance_dropped`

**Subscriptions:**
- `subscription.created`
- `subscription.started`
- `subscription.ended`
- `subscription.plan_changed`
- `subscription.usage_exceeded`

**Invoices:**
- `invoice.issued`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Data exports:**
- `data_exports.transfer_success`

## Sandbox vs Production

Orb maintains separate webhook endpoints and signing secrets for sandbox and production environments. Use the sandbox to wire up your handler and test the verification path, then promote to production with a new endpoint and secret.

## Local Development

Use the Hookdeck CLI to receive webhooks on your local machine — no account required, one paste-and-run line:

```bash
npx hookdeck-cli listen 3000 orb --path /webhooks/orb
```

(Use port `8000` for the FastAPI example.) The CLI prints a public URL you can paste into the Orb dashboard as the endpoint, and provides a web UI for inspecting requests and replaying them.

## Environment Variables

Store your signing secret securely:

```bash
# .env
ORB_WEBHOOK_SECRET=your_webhook_signing_secret_here
```

Never commit secrets to version control.

## Full Documentation

For complete setup instructions, see the [Orb webhooks documentation](https://docs.withorb.com/integrations-and-exports/webhooks).
