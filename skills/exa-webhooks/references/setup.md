# Setting Up Exa Webhooks

## Prerequisites

- An Exa account and API key (https://dashboard.exa.ai/api-keys)
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 exa --path /webhooks/exa` locally)

## Get Your Signing Secret

Webhooks are created through the API; there is no dashboard step. The signing `secret` is returned **only in the create response**. Later reads (`GET /v0/webhooks/{id}`) omit it, so save it immediately.

```bash
curl -X POST https://api.exa.ai/websets/v0/webhooks \
  -H "x-api-key: $EXA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-endpoint.example.com/webhooks/exa",
    "events": ["webset.created", "webset.idle", "webset.search.completed", "webset.item.created", "webset.item.enriched"]
  }'
```

Put the returned `secret` in `EXA_WEBHOOK_SECRET`.

## Register Your Endpoint

- `events` takes 1 to 19 event types. `url` must be the final URL: **Exa does not follow 3xx redirects**, and a redirect counts as a failed delivery.
- `metadata` (optional) is a set of string key-value pairs you attach to the webhook.
- Update or delete with `PATCH` / `DELETE /v0/webhooks/{id}`; deleting sets the status to `inactive`. List delivery history with `GET /v0/webhooks/{id}/attempts`.

If you lose the secret, create a new webhook and delete the old one.

## Test Mode vs Live Mode

Exa has no separate test mode for webhooks. Create a webhook pointing at a Hookdeck tunnel URL, then create a small Webset to generate `webset.created` and `webset.item.created` events.
