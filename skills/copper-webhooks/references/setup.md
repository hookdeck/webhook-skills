# Setting Up Copper Webhooks

Copper has no dashboard page for webhooks. Subscriptions are created with the Developer API.

## Prerequisites

- A Copper account with an API key and the email of the user it belongs to
  (Settings > Integrations > API Keys)
- A public `https://` endpoint (Copper rejects `http://`). For local work, run
  `npx hookdeck-cli listen 3000 copper --path /webhooks/copper` and use the URL it prints.

## Pick a Secret Header

Choose a header name and a long random value, for example:

```
X-Webhook-Secret: 5f2c1c1e9a7b4d0e8f3a6b2c9d4e7f10
```

Store the value as `COPPER_WEBHOOK_SECRET` and the name as `COPPER_WEBHOOK_HEADER`. The value you
store must be the exact, whole header value, including any `Bearer ` prefix if you add one.

## Register Your Endpoint

```bash
curl -X POST https://api.copper.com/developer_api/v1/webhooks \
  -H "X-PW-AccessToken: $COPPER_API_KEY" \
  -H "X-PW-Application: developer_api" \
  -H "X-PW-UserEmail: you@example.com" \
  -H "Content-Type: application/json" \
  -d '{
    "target": "https://your-app.example.com/webhooks/copper",
    "type": "person",
    "event": "update",
    "headers": { "X-Webhook-Secret": "5f2c1c1e9a7b4d0e8f3a6b2c9d4e7f10" }
  }'
```

Copper sends the `headers` object as HTTP headers on every notification for this subscription.

Create one subscription per `type` + `event` pair you need: `lead`, `person`, `company`,
`opportunity`, `project`, `task` or `activity_log`, each with `new`, `update` or `delete`.
Reuse the same header on all of them.

Optional extras:

- `secret`: an object such as `{"key1": "value1"}` whose key/value pairs Copper merges into the top
  level of the JSON body (`"key1": "value1"`), not a nested `secret` field. It is
  not a header and not a signature; treat it as a weak extra check only.
- `custom_field_computed_values`: `true` converts dropdown option IDs to option names.

Manage subscriptions with `GET /webhooks`, `GET /webhooks/{id}`, `PUT /webhooks/{id}` and
`DELETE /webhooks/{id}`.

## Rotating the Secret

`PUT /webhooks/{id}` with a new `headers` object for each subscription, then update
`COPPER_WEBHOOK_SECRET`. Do it for every subscription.

## Test Mode vs Live Mode

There is no test mode. Create a record (or edit one) in Copper to trigger a subscription, or use
the tests in `examples/` which post sample payloads locally.
