# Setting Up Belco Webhooks

## Prerequisites

- A Belco account and a shop (you need its `shopId`)
- A Belco API access token (sent in the `Authorization` header of REST API calls)
- A public HTTPS endpoint URL that accepts `POST`

## Register Your Endpoint

Webhooks are created per shop. In the Belco dashboard, open Settings (the gear icon), then
Developers > Webhooks, choose the shop, add a webhook, enter its URL, tick its events and save
([Belco help center](https://www.belco.nl/helpdocs/webhooks-toevoegen/), in Dutch).

Or create one through the REST API:

```bash
curl -X POST https://api.belco.io/v1/webhooks \
  -H "Authorization: $BELCO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shopId": "YOUR_SHOP_ID",
    "url": "https://example.com/webhooks/belco",
    "events": ["conversation.created", "conversation.closed", "call.answered"]
  }'
```

Supported `events`: `call.created`, `call.queued`, `call.answered`, `call.closed`,
`conversation.created`, `conversation.replied`, `conversation.note.added`, `conversation.assigned`,
`conversation.closed`, `conversation.reopened`.

The API also lets you list, retrieve, update, activate, deactivate and delete webhooks
(`GET /webhooks`, `PUT /webhooks/{webhookId}/activate`, ...).

## Get Your Signing Secret

Every webhook has its own unique secret. The dashboard shows it on the webhook's overview, and the
API returns it as the `secret` property of the Webhook object. Store it as `BELCO_WEBHOOK_SECRET`.
Belco does not document a secret format or rotation, so treat the value as an opaque string and use
it as-is (UTF-8 bytes).

## Setup with Hookdeck

Create a Hookdeck source with the **Belco** type and paste the webhook's `secret` into the source's
webhook verification settings. Then register the Hookdeck source URL as the webhook URL, in the
dashboard or the call above.

## If Your Webhook Stops Delivering

10 consecutive failures within 5 minutes disable the webhook. Fix the endpoint, then re-enable it in
the Belco dashboard (or with `PUT /webhooks/{webhookId}/activate`).

## Local Development

```bash
npx hookdeck-cli listen 3000 belco --path /webhooks/belco
```

Use the Hookdeck URL as the webhook `url` while developing.
