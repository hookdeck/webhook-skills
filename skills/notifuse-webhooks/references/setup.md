# Setting Up Notifuse Webhooks

## Prerequisites

- A Notifuse workspace (cloud or self-hosted) and a user or API key with **Webhook Subscriptions** write permission
- A public HTTPS URL for your endpoint (use the Hookdeck CLI while developing)

## Create a Subscription

In the Notifuse console, open the outgoing webhooks page and add a subscription, or call the API:

```bash
curl -X POST "https://your-instance.com/api/webhookSubscriptions.create" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "your_workspace",
    "name": "Production Webhook",
    "url": "https://api.example.com/webhooks/notifuse",
    "event_types": ["contact.created", "contact.updated", "email.sent"]
  }'
```

Notifuse generates the signing secret on creation. There is no challenge or handshake step.

## Choose Events and Filters

- `event_types`: any of the 23 events in [overview.md](overview.md).
- `list_ids`: limits `list.*` events to those lists (default: every list).
- `segment_ids`: limits `segment.*` events to those segments (default: every segment).
- `custom_event_filters`: `{ "goal_types": [...], "event_names": [...] }` for `custom_event.*`.

Filter whenever you can: a workspace with large lists sends one delivery per contact per list event.

## Get Your Signing Secret

The secret has the form `whsec_<base64>`. Only the workspace owner can see it, and ordinary read access never hands it out. Put the whole value in `NOTIFUSE_WEBHOOK_SECRET`.

To rotate it, the workspace owner calls `webhookSubscriptions.regenerateSecret`. The old secret is invalid at once, so deploy the new one first or accept a short failure window. Deleting and recreating a subscription also issues a new secret.

## Test Your Endpoint

```bash
curl -X POST "https://your-instance.com/api/webhookSubscriptions.test" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "workspace_id": "your_workspace", "id": "whsub_a1b2c3d4e5f6", "event_type": "contact.created" }'
```

`event_type` is optional; with it the test carries a realistic sample payload. Firing a test needs write permission. To see what happened, read the delivery history with `webhookSubscriptions.deliveries`.

## Local Development

```bash
npx hookdeck-cli listen 3000 notifuse --path /webhooks/notifuse   # use 8000 for FastAPI
```

Use the URL it prints as the subscription URL. No install or account is required.

## Manage the Subscription

- **Disable** instead of deleting when you expect the endpoint back: the secret and delivery history survive. Deleting discards queued deliveries and can't be undone.
- A subscription with a `source` (for example `zapier`) was created by another tool. Don't delete it from Notifuse.
- After an automatic disable, fix the endpoint and re-enable the subscription. The failure history is cleared on re-enable.
