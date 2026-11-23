# Setting Up Agora Webhooks

## Prerequisites

- An Agora account and project
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## Get Your Signing Secret

1. In Agora Console, select **Webhooks** from the sidebar, then **New Webhook**.
2. From the **Product** dropdown, select **RTC**.
3. Copy the **Signing Secret** and store it as `AGORA_WEBHOOK_SECRET`. It is used as-is, as UTF-8 bytes (not hex- or base64-decoded).

## Register Your Endpoint

1. Choose the **Region** nearest your server.
2. Enter your HTTPS **Receiving URL**, for example `https://example.com/webhooks/agora`. Only HTTPS endpoints are supported.
3. Select the events to receive (for example 101-104). Enable **IP whitelist** only if your server is behind a firewall.
4. Select **Run health check**. Agora sends test callbacks for your subscribed events, with channel name `test_webhook` and uid `12121212`, and your endpoint must answer `200` with a JSON body within 10 seconds.
5. When the health check passes, select **Save**.

## Test Locally

```bash
npx hookdeck-cli listen 3000 agora --path /webhooks/agora
```

Use the printed URL as the webhook URL in Agora Console.
