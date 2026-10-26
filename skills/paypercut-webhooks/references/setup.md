# Setting Up Paypercut Webhooks

## Prerequisites

- A Paypercut account with access to the Merchant Dashboard (or an API key for the Webhooks API)
- Your application's public HTTPS webhook URL

## Create an Endpoint

1. In the [Merchant Dashboard](https://dashboard.paypercut.io/developers/webhooks), add a webhook endpoint, or call the Webhooks API (`POST /v1/webhooks`).
2. Set the endpoint URL and the `enabled_events` you handle, for example `payment.succeeded`, `payment.failed`, `checkout_session.completed` and `payout.paid`. Pass identifiers exactly as listed; wildcards aren't accepted.
3. Choose `api_version`: `v2` for new integrations. It can't be changed later, so create another endpoint to switch.
4. Set `connect: true` only if you need events from connected accounts (the event's top-level `account` identifies the account).

```json
{
  "name": "Production payment events",
  "url": "https://example.com/webhooks/paypercut",
  "enabled_events": ["payment.succeeded", "payment.failed"],
  "api_version": "v2",
  "connect": false
}
```

## Get Your Signing Secret

Each endpoint has its **own secret**, shown in the Dashboard or returned by the Webhooks API. Put it in `PAYPERCUT_WEBHOOK_SECRET` and use it as-is (it is not hex- or base64-decoded). Paypercut recommends rotating it at least quarterly.

## Hookdeck Source

If Hookdeck sits in front of your handler, create a source of type **Paypercut** and use its URL as the endpoint URL in Paypercut, with the signing secret on the source.

- **Methods:** Paypercut's docs don't name the HTTP method. Hookdeck's Paypercut source pre-selects POST without managing the method, so any other method Paypercut uses must also be allowed on the source. The examples accept GET, POST, PUT, PATCH and DELETE.
- Hookdeck applies no timestamp window, so its retries and replays (which resend the original `t`) still verify.

## Local Development

```bash
npx hookdeck-cli listen 3000 paypercut --path /webhooks/paypercut
```

Use the printed URL as the endpoint URL.

## Test Mode vs Live Mode

Paypercut's webhooks page doesn't describe a separate test environment. Create the endpoint (and its secret) in each environment you use.
