# Setting Up Orb Webhooks

## Prerequisites

- Orb account (test mode works for development)
- Your application's webhook endpoint URL (must be HTTPS in production)

## Register Your Endpoint

1. Open the [webhooks portal](https://app.withorb.com/webhooks) in Orb, or call the [Create webhook endpoint](https://docs.withorb.com/api-reference/webhook-endpoint/create-webhook-endpoint) API.
2. Enter your endpoint URL (e.g., `https://your-app.com/webhooks/orb`). Production endpoints must use `https`.
3. Choose the endpoint's payload style, `standard` (the default for new endpoints) or `expanded`. See [overview.md](overview.md#payload-styles-standard-vs-expanded).
4. (Optional) Limit the events it receives with `enabled_event_types`. If omitted, every event type is sent.

An account can have at most 20 webhook endpoints by default.

## Get Your Signing Secret

Each Orb webhook endpoint has its **own** secret, which Orb uses to sign every event sent to it — distinct from your account API key.

- The Create webhook endpoint API returns the secret in its response, and no other endpoint returns it again, so store it when you create the endpoint.
- Copy it into your application's environment as `ORB_WEBHOOK_SECRET`, which Orb's SDKs read by default.

During a secret rotation, `X-Orb-Signature` can carry several space-separated signatures, and a delivery is valid when any one matches. The handlers in `examples/` accept that.

## Testing and Resending

From the webhooks portal you can send a test event (`resource_event.test`) to an endpoint, and resend any past event.

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

## Test Mode

Orb has a test mode with test data kept apart from live billing, and its webhooks are sent from the same IP addresses as live ones. Wire up and test your handler there first.

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
