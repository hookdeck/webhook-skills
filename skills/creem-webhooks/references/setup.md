# Setting Up Creem Webhooks

## Prerequisites

- A Creem account (test mode and live mode each have their own dashboard and endpoints)
- A public HTTPS URL for your endpoint (use the Hookdeck CLI while developing)

## Register Your Endpoint

In the dashboard:

1. Open the **Developers** tab of the Creem dashboard.
2. Add a webhook with your publicly reachable HTTPS URL (a tunnel such as ngrok works for local
   development).

Or programmatically, with `POST /v1/webhooks` (also available in the TypeScript SDK, the CLI and
the MCP server; API keys need the `webhooks:write` scope):

```bash
creem webhooks create --url https://example.com/webhooks/creem \
  --event checkout.completed --event subscription.paid --json
```

An empty `events` list subscribes the endpoint to every event type.

## Get Your Signing Secret

Copy the secret from the dashboard's **Developers > Webhook** page into `CREEM_WEBHOOK_SECRET`.
The API returns it when the endpoint is created, and you can fetch it again later with
`creem.webhooks.getSecret(id)` or `creem webhooks secret <id> --json`. Treat it as a plain
string key.

## Test Mode vs Live Mode

1. Register your development endpoint and create a few test payments in the test environment to
   confirm events arrive.
2. Deploy the endpoint to production.
3. Register the production endpoint on the live dashboard and use its own secret.

For local work, `creem listen --forward-to http://localhost:3000/webhooks/creem` (Creem CLI)
registers a temporary endpoint and forwards events with the real signature header.

## Local Development

```bash
npx hookdeck-cli listen 3000 creem --path /webhooks/creem
```

Register the printed URL as the endpoint URL. Hookdeck's Creem source verifies the
`creem-signature` header with the same secret.
