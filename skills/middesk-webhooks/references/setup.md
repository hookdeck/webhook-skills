# Setting Up Middesk Webhooks

## Prerequisites

- A Middesk account (sandbox and Production are separate; create a webhook in each)
- A public HTTPS URL for your endpoint (for local work use `npx hookdeck-cli listen 3000 middesk --path /webhooks/middesk`)

## Choose and Set Your Signing Secret

Middesk doesn't generate the signing secret for you: you define it when you create the webhook, in the `secret` field of the Webhooks API. Examples in the docs use values like `whsec_abcdef123456` or `sec_...`. Use any strong random string, and store it as `MIDDESK_WEBHOOK_SECRET`. The whole string is the HMAC key.

## Register Your Endpoint

Via the dashboard: Settings > Webhooks (https://app.middesk.com/settings/webhooks).

Via the API:

```bash
curl https://api.middesk.com/v1/webhooks \
  -H "Authorization: Bearer $MIDDESK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/middesk",
    "enabled_events": ["business.created", "business.updated", "order.updated"],
    "secret": "whsec_abcdef123456"
  }'
```

`enabled_events` is required; use `["*"]` for all events. Optional `include` trims business payloads, and `event_schemas` customizes `data.object`.

## Recommended Events

`business.created`, `business.updated`, `order.created`, `order.updated`.

## Sandbox vs Production

Create separate webhook endpoints (and ideally separate secrets) for sandbox and Production.

## Optional: Restrict by IP

Middesk sends from `35.239.59.102`, `35.192.63.74` and `104.198.38.1`. mTLS and OAuth bearer-token modes also exist (see [Secure webhooks](https://docs.middesk.com/build/secure-webhooks)); this skill covers the HMAC signature only.
