# Setting Up Honeycomb Webhooks

> **Hookdeck setup note:** Set a Shared Secret on the Honeycomb webhook. Webhooks without one send nothing to verify.

## Prerequisites

- A Honeycomb team where you can edit **Team Settings > Integrations**
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 honeycomb --path /webhooks/honeycomb` locally)

## Create the Webhook Integration

1. Go to **Team Settings > Integrations** and find **Trigger, SLOs, and Anomaly Detection Recipients**.
2. Add an integration, choose **Webhook** as the provider and enter a **Name**.
3. Enter your **Webhook URL** (e.g. `https://example.com/webhooks/honeycomb`).
4. Enter a **Shared Secret** and store the same value as `HONEYCOMB_WEBHOOK_SECRET`. The secret is
   optional in Honeycomb, but without one Honeycomb sends no `X-Honeycomb-Webhook-Token` header,
   so there is nothing to verify.
5. Optionally customize the payload (Payload tab), variables and headers (up to 5; the names
   `Content-Type`, `User-Agent` and `X-Honeycomb-Webhook-Token` are reserved).
6. Select **Add**.

## Attach It to Alerts

The webhook sends nothing until you use it as a recipient:

- **Triggers:** add the webhook as a recipient on the Trigger.
- **SLO burn alerts:** create or edit a burn alert and choose the webhook.
- **Anomaly Detection:** pick the webhook as the recipient for the anomaly signal.

A webhook with custom payloads needs a payload configured for each alert type it is used with; a
webhook with only a Trigger payload can't be used by an SLO Budget Rate Burn Alert.

## HTTP Method

Honeycomb's docs don't name the HTTP method. The example handlers accept GET, POST, PUT, PATCH
and DELETE. Hookdeck's Honeycomb source pre-selects POST without managing the method, so if
Honeycomb uses any other method, allow that method on the source too.

## Test

Fire a Trigger or burn alert, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/honeycomb \
  -H "Content-Type: application/json" \
  -H "X-Honeycomb-Webhook-Token: $HONEYCOMB_WEBHOOK_SECRET" \
  -H "X-Honeycomb-Webhook-Delivery-ID: test-1" \
  -d '{"name":"Slow checkout requests","status":"TRIGGERED"}'
```

The payload is illustrative; look at a real delivery in your Honeycomb or Hookdeck logs.

## Network Notes

Use the Shared Secret header, not an IP allowlist, to authenticate requests. Rotate the Shared
Secret in Honeycomb and in `HONEYCOMB_WEBHOOK_SECRET` together if it leaks.
