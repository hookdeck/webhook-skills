# Setting Up LoyaltyLion Webhooks

## Prerequisites

- A LoyaltyLion account with API access (an API key with the right scopes, or an OAuth client)
- A public HTTPS endpoint for your webhook receiver (`npx hookdeck-cli listen 3000 loyaltylion --path /webhooks/loyaltylion` gives you one for local development)

## Which Secret Signs the Webhooks?

Paste the OAuth client secret for webhooks registered with an OAuth client, or your site secret for other webhooks.

Webhooks created with API keys are signed with the site secret; webhooks created by an OAuth client are signed with that client's secret. Use the secret exactly as shown (its UTF-8 bytes); don't hex- or base64-decode it. Set it as `LOYALTYLION_WEBHOOK_SECRET`.

## Subscribe to a Topic

Subscribe with the v2 Webhook API, one request per topic.

```bash
curl -X POST https://api.loyaltylion.com/v2/webhooks \
  -H "Authorization: Bearer $LOYALTYLION_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"webhook": {"topic": "program_events/customer.points_earned", "address": "https://example.com/webhooks/loyaltylion"}}'
```

- `topic`: one of the topics in [overview.md](overview.md)
- `address`: the full URL that receives the webhook, starting with `https://`
- Authentication is an API key as a `Bearer` token (the older site token and secret Basic auth is deprecated)
- Some topics need a scope, e.g. `customers/update` and `receipts/manual_approval_required` need `read_customers`

Use `GET /v2/webhooks` to list subscriptions and `DELETE /v2/webhooks/{webhook_id}` to remove one. An OAuth client can only see the webhooks it created; webhooks created with API keys are never visible to OAuth clients.

## Custom Reward Fulfilment (`rewards/store_fulfilment`)

You can't subscribe to `rewards/store_fulfilment` through the API. Set a fulfilment webhook URL on a custom
reward in the LoyaltyLion admin instead. LoyaltyLion sends a `test: true` request when you create or update
the reward to confirm the URL responds; a `2xx` response to a real request marks that redemption as fulfilled.

## Test Mode vs Live Mode

LoyaltyLion has no separate webhook test mode. Subscribe a development URL (a Hookdeck CLI tunnel works),
then trigger the event (earn points, enrol a test customer) on a test program.
