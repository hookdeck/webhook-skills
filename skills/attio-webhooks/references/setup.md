# Setting Up Attio Webhooks

## Prerequisites

- An Attio workspace where you can open the developer settings page
- An HTTPS endpoint URL. Attio rejects plain `http://` target URLs
- For API creation: an access token with webhook read/write scopes

## Option 1: Create a Webhook in Developer Settings

1. In Attio, open the **developer settings** page (Workspace settings → Developers).
2. Select an integration (or create one).
3. Create a webhook inside the integration and enter your **target URL** (e.g. `https://your-app.com/webhooks/attio`).
4. Subscribe to the events you need, for example `record.created`, `record.updated`, `list-entry.created`, `list-entry.updated`.
5. Copy the webhook's **signing secret** from the webhook page and set it as `ATTIO_WEBHOOK_SECRET`.

> Webhooks created with tokens from Attio's OAuth sign-up flow don't appear in developer settings. Manage those via the API.

## Option 2: Create a Webhook via the API

Use the API when you're building an integration that runs across many workspaces, or when you need filters (filters are API-only).

```bash
curl -X POST https://api.attio.com/v2/webhooks \
  -H "Authorization: Bearer $ATTIO_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "target_url": "https://your-app.com/webhooks/attio",
      "subscriptions": [
        { "event_type": "record.created", "filter": null },
        { "event_type": "record.updated", "filter": null },
        {
          "event_type": "list-entry.updated",
          "filter": {
            "$and": [
              { "field": "id.list_id", "operator": "equals", "value": "<sales-list-id>" }
            ]
          }
        }
      ]
    }
  }'
```

The response includes `data.secret`. **Store it right away**: the API only returns the secret when the webhook is created. In multi-workspace integrations, store one secret per webhook and look it up using the payload's `webhook_id`.

## Test Your Endpoint

For local development, expose your server over HTTPS with the Hookdeck CLI (no account needed):

```bash
npx hookdeck-cli listen 3000 attio --path /webhooks/attio
```

Use the printed HTTPS URL as the webhook's target URL. Then:

1. Open the webhook in developer settings.
2. Next to a subscribed event, open the dropdown and choose **Send test event to target URL**.
3. Attio fills the payload with real IDs from your workspace when it can, and random data otherwise. Filters are not applied to test events.

## Network Allowlisting (Optional)

Attio recommends signature verification over IP allowlisting. If your firewall requires it, Attio publishes its webhook egress IPs in the [webhooks guide](https://docs.attio.com/rest-api/guides/webhooks#ip-addresses). The list can grow over time.

## Headers Your Endpoint Receives

| Header | Use |
|--------|-----|
| `Attio-Signature` | Verify: hex HMAC-SHA256 of the raw body with your webhook secret |
| `X-Attio-Signature` | Same value, for legacy middleware |
| `Idempotency-Key` | Deduplicate retries and redeliveries |
