# Setting Up Sendcloud Webhooks

## Prerequisites

- A Sendcloud account with a Sendcloud API integration
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Signing Secret

Sendcloud signs with the integration's **Secret Key** or **Webhook Signature Key**, depending on the integration type. Use the same value as `SENDCLOUD_WEBHOOK_SECRET`.

## Register Your Endpoint

1. In the Sendcloud platform go to **Settings > Integrations** and click **Configure** on your Sendcloud API integration.
2. Select the **Webhook feedback enabled** checkbox.
3. Enter your endpoint URL in **Webhook url**.
4. Click **Save**.
5. Optional: click **Test API webhook** to send a test request.

Each integration needs its own webhook configuration.

## Local Development

```bash
npx hookdeck-cli listen 3000 sendcloud --path /webhooks/sendcloud
```

Use the printed URL as the Webhook url.

## Delivery and Retries

Your endpoint must return a `2xx` within 10 seconds. Sendcloud makes up to 10 attempts in total over about an hour and a half: the first retry is within 5 minutes and later waits grow to roughly half an hour. Timeouts, an unreachable endpoint, `406`, `408`, `409`, `429` and `5xx` are retried. Any other `4xx`, such as `400`, `401`, `404` or `422`, stops delivery with no retry. Every failed attempt is logged in the connection issue log. Sendcloud follows redirects, sending the same request with the same body to the new URL.
