# Setting Up Shippo Webhooks

## Prerequisites

- A Shippo account with API access
- A public HTTPS endpoint (URL must be **under 200 characters**)

## Create a Webhook in the Dashboard

1. Sign in to Shippo.
2. Go to **Settings → API**, then find the **Webhooks** section (the Shippo API Portal).
3. Click **Add webhook**.
4. Choose the **Event Type** (`track_updated`, `transaction_created`,
   `transaction_updated`, `batch_created`, `batch_purchased`,
   `automations_label_resolved`, or `all`), the **Mode** (test or live), and the **URL**.
5. Click **Save**. The same page lets you send a test webhook with a sample payload.

You can also manage webhooks programmatically with the
[Webhooks API](https://docs.goshippo.com/tracking/creating-webhooks) (currently beta).

## Option 1: Request HMAC Signing (recommended)

HMAC is **not self-serve**. To enable it:

1. Email your Shippo account manager, or contact the
   [sales team](https://goshippo.com/become-a-shippo-partner) and put this in **Additional Details**:
   `HMAC Webhook Setup for <your company name>`
2. Shippo creates a token, and their solutions team contacts you to exchange it.
   This can take **up to 10 business days**.
3. Store the secret as `SHIPPO_WEBHOOK_SECRET`.

From then on, requests include `Shippo-Auth-Signature: t=<timestamp>,v1=<hex signature>`.
See [verification.md](verification.md).

## Option 2: Self-Generated URL Token (immediate)

While you wait for HMAC, or instead of it:

1. Generate a long random value, e.g. `openssl rand -hex 32`.
2. Append it to the webhook URL: `https://your.app/webhooks/shippo?token=<value>`.
   For an existing webhook, click **Edit** to add it.
3. Store the same value as `SHIPPO_WEBHOOK_TOKEN`.

Shippo sends the token back as the `token` query parameter. Compare it with a
timing-safe comparison. Keep the token out of your logs, because it appears in URLs.

## Option 3: IP Allowlist

Reject requests that don't come from Shippo's egress IPs:

| Region | IPs |
|--------|-----|
| US | `52.4.41.98`, `52.23.121.194`, `52.44.110.80`, `54.81.253.187`, `54.81.255.221` |
| EU | `34.248.247.69`, `34.253.119.130`, `52.214.174.64`, `54.72.179.250` |

Check the [webhook security page](https://docs.goshippo.com/docs/Tracking/WebhookSecurity)
for the current list. An allowlist doesn't work when traffic reaches you through a
proxy or tunnel (e.g. Hookdeck), because the source IP changes. Use the token or HMAC instead.

The options can be combined, e.g. HMAC and a token together.

## Test Mode vs Live Mode

- Webhooks are created per **Mode**. Test-mode webhooks fire for objects created
  with your test API token, and payloads have `"test": true`.
- Use the dashboard's test button to send a sample payload.

## Local Development

```bash
npx hookdeck-cli listen 3000 shippo --path /webhooks/shippo
```

Use the printed Hookdeck URL (with `?token=…` if you use a token) as the webhook URL in Shippo.
