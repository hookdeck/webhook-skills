# Setting Up Descope Webhooks (Audit Webhook Connector)

## Prerequisites

- A Descope project with access to the Console
- A publicly reachable endpoint for your handler (e.g. `https://your-app.com/webhooks/descope`). For local development use a tunnel: `npx hookdeck-cli listen 3000 descope --path /webhooks/descope`

## Configure the Connector

1. In the Descope Console, open **Connectors** and add the **Audit Webhook** connector.
2. Fill in:
   - **Connector Name** and **Description**
   - **Base URL**: your endpoint (must start with `http://` or `https://`)
   - **Authentication Type**: Bearer Token, API Key, Basic Authentication, or None. This is separate from the HMAC signature and optional.
   - **Headers** (optional): extra key/value headers
   - **HMAC Secret** (optional): **set this**. It is the signing key for `x-descope-webhook-s256`.
   - **Trust Any Certificate**: leave off in production
   - **Stream Audit Events**: enable to start streaming
3. Save the connector, then store the HMAC Secret in `DESCOPE_WEBHOOK_SECRET`.

## Check Delivery

Events appear on your endpoint after a delay of several minutes, batched. Compare with the **Audit** page in the Console, which should match what you receive.

## Network Notes

The connector sends from Descope's static IPs; allowlist them on your gateway or firewall if needed.

## Testing

There is no "send test event" step documented. Trigger a real audit event (such as logging in a test user) and wait for the batch, or POST a self-signed array to your endpoint using the algorithm in [verification.md](verification.md).
