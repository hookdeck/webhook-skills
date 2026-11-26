# Setting Up Ashby Webhooks

## Prerequisites

- An Ashby account with admin access
- Your application's public webhook endpoint URL (e.g. `https://your-app.com/webhooks/ashby`)

## Register Your Endpoint

1. In Ashby, go to **Admin → Integrations → Webhooks**.
2. Click to add a new webhook.
3. **Webhook type** — Select the single event type this webhook should deliver
   from the dropdown. Each webhook delivers **one event type** to **one URL**.
   To handle multiple event types, create multiple webhooks (they can point at
   the same endpoint URL).
4. **Request URL** — Enter your endpoint URL.
5. **Secret token** — Enter a secret token. It is optional but **strongly
   recommended**: Ashby uses it to sign requests so you can verify authenticity.
   Store this value as `ASHBY_WEBHOOK_SECRET` in your app.
6. Save. Ashby immediately sends a `ping` event to validate the endpoint.

## Get Your Signing Secret

The secret is the **secret token you enter** when creating or editing the
webhook (Ashby does not generate it for you). Use the same value in your app's
`ASHBY_WEBHOOK_SECRET` environment variable. Because it is configured per
webhook, if several webhooks point at one endpoint, give them the **same** secret
so a single verification path works.

## Ping and Auto-Disable

- Creating or editing a webhook sends a `ping` event.
- If your endpoint does not respond or returns an error code, Ashby saves the
  webhook in a **disabled** state.
- To re-enable: fix your endpoint, then check the enabled box and click
  **Update** in **Admin → Integrations → Webhooks**, which sends a new ping.

Always verify the signature first and return a `2xx` status quickly.

## Multiple Webhooks / Distributing Load

You can create multiple webhooks for the same event type pointing at different
URLs to fan requests out across endpoints. Conversely, multiple event-type
webhooks can point at one endpoint — dispatch on the `action` field in the body.

## Testing

- The `ping` event on create/edit is the quickest confirmation your endpoint and
  signature verification work.
- For local development, tunnel requests to your machine with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 ashby --path /webhooks/ashby
  ```

  Use the printed URL as the **Request URL** in the Ashby webhook settings.

## No Official SDK

Ashby does not publish a webhook SDK. Verify the `Ashby-Signature` header
manually with HMAC-SHA256 — see [verification.md](verification.md).
