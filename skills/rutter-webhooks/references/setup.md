# Setting Up Rutter Webhooks

## Prerequisites

- A Rutter account with access to the dashboard
- A publicly reachable HTTPS endpoint (use a tunnel for local development)

## Get Your Client Secret

Rutter signs webhooks with your organization's **client secret**. Copy it from the Rutter dashboard (where you get your API keys) and store it as `RUTTER_CLIENT_SECRET`. Use the value as-is (a raw string; do not base64-decode it).

During a client secret rotation, Rutter keeps the old secret active for a grace period and signs with both. Store the new secret in `RUTTER_CLIENT_SECRET` and the expiring one in `RUTTER_CLIENT_SECRET_PREVIOUS` until the grace period and in-flight webhooks are done.

## Register Your Endpoint

1. Start your server and a tunnel. With Hookdeck (no account required):
   ```bash
   npx hookdeck-cli listen 3000 rutter --path /webhooks/rutter
   ```
   (Rutter's own guide suggests ngrok: `ngrok http 4000`.)
2. In the Rutter dashboard, open the **Platforms** page and paste the public URL as the webhook URL.
3. Run through the connection flow again and check that events (starting with `CONNECTION` / `INITIAL_UPDATE`) reach your endpoint.

## Real-Time Webhooks

For QuickBooks Online, Xero, Stripe and Sage Intacct, open the platform in the dashboard's **Platforms** tab, then its **Webhooks** tab, and follow the instructions to enable real-time webhooks. The signature scheme is the same.

## Test Mode vs Live Mode

Rutter's docs do not describe a separate test mode for webhooks. Use a tunnel such as Hookdeck CLI or ngrok with the connection flow to generate real events, and use the client secret of the organization that owns the connection.
