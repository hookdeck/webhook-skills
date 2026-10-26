# Setting Up Cerebrum Webhooks

## Prerequisites

- A Cerebrum integration
- A publicly reachable HTTPS endpoint for your application (use the Hookdeck CLI during development)
- Access to the Svix Portal that Cerebrum provides, to get the signing secret

## Register Your Endpoint

Cerebrum has one `postbackWebhookUrl` per integration. Set it to your handler URL, for example `https://example.com/webhooks/cerebrum`. Deliveries are POSTed as JSON.

Cerebrum answers no challenge and sends no handshake request, so nothing has to be echoed back. Respond with a `2xx` within 30 seconds.

## Get Your Signing Secret

Cerebrum's validation page doesn't print a secret value. The secret is issued by Svix:

1. Ask Cerebrum for access to the Svix webhook portal (it is available on request).
2. Open the portal for your integration and copy the signing secret.
3. Store the full value (it normally looks like `whsec_<base64>`, Svix's default form, which Cerebrum doesn't state itself) in `CEREBRUM_WEBHOOK_SECRET`.

There is one secret per webhook.

## Choose Events

Through the Svix Portal you can manage subscriptions, replay messages and read delivery logs. Handle at least the order events, and the voucher events if you use vID:

- `ORDER_STATUS_CHANGE`, `ORDER_SCORE_CHANGE`, `ORDER_CUSTOM_SCORE_CHANGE`, `ORDER_DISPUTE_RESOLVED`
- `VOUCHER_STARTED`, `VOUCHER_REDEEMED`, `VOUCHER_EXPIRED`
- `MONITORING_REPORT_GENERATED`, `BEAM_INPUT_CREATED`

## Local Development

```bash
npx hookdeck-cli listen 3000 cerebrum --path /webhooks/cerebrum   # use 8000 for FastAPI
```

Set the printed URL as the `postbackWebhookUrl` of a test integration. No account is needed; the CLI creates a guest account and shows requests in a local web UI.

## Test Mode vs Live Mode

Cerebrum's webhook pages don't describe a separate test mode. Use a non-production integration with its own `postbackWebhookUrl` and secret, and replay messages from the Svix Portal while you iterate.
