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

Failed deliveries are retried up to 10 times with exponential backoff starting at 5 minutes, capped at 1 hour. After that Sendcloud stops and logs the failure in the connection issue log.
