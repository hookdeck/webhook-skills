# Setting Up Aurora Solar Webhooks

## Prerequisites

- An Aurora Solar tenant with access to the webhooks dashboard or the Webhooks API
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 aurora-solar --path /webhooks/aurora-solar` locally)

> Set header_auth_key and header_auth_value on the Aurora Solar webhook and enter them here. Webhooks without them send nothing to verify.

## Choose a Header Name and Secret

Aurora lets you attach one custom header to every webhook through two fields on the subscription:

- `header_auth_key`: the header name. It is user-chosen; Aurora's docs use `X-Aurora-Webhook-Token`.
- `header_auth_value`: the secret value, for example a random UUID.

Store them as `AURORA_SOLAR_WEBHOOK_HEADER` and `AURORA_SOLAR_WEBHOOK_SECRET`. The secret is the
exact, whole `header_auth_value`, including any `Bearer ` prefix you typed; the handlers compare
the whole value and never strip or parse a prefix.

Aurora also offers **Basic Auth** (`basic_auth_username` / `basic_auth_password`). Hookdeck's
Aurora Solar source does not cover it, so use header-based token authentication.

## Register Your Endpoint

Create a subscription in Aurora's webhooks dashboard, or with the API:

```
POST /tenants/{tenant_id}/webhooks
{
  "webhook": {
    "description": "Aurora - project created",
    "event": "project_created",
    "url_template": "https://<hookdeck-url>?event=project_created&project_id=<PROJECT_ID>&source=<SOURCE>",
    "enabled": true,
    "header_auth_key": "X-Aurora-Webhook-Token",
    "header_auth_value": "<your secret>"
  }
}
```

1. Use an HTTPS URL so the query string is encrypted in transit.
2. Put a static `event=<event name>` in the template. Each subscription is for one event, and the
   request carries nothing else that names it. Create one subscription per event.
3. Add the attributes you need as placeholders (`<PROJECT_ID>`, `<DESIGN_ID>`, `<STATUS>`, ...).
   See [overview.md](overview.md) for the attributes of each event.
4. Optionally add filters (for example only `succeeded` jobs) so Aurora skips events you don't need.
5. Set `header_auth_key` and `header_auth_value`.

## Methods

Aurora fires **GET** requests with the data in the query string and no body. Hookdeck's Aurora
Solar source pre-selects GET without managing the method. The example receivers handle GET on
`/webhooks/aurora-solar` and also accept POST for flexibility.

## Test

Replay a webhook with curl (GET, no body):

```bash
curl "http://localhost:3000/webhooks/aurora-solar?event=project_created&project_id=3fa85f64-5717-4562-b3fc-2c963f66afa6&source=api" \
  -H "$AURORA_SOLAR_WEBHOOK_HEADER: $AURORA_SOLAR_WEBHOOK_SECRET"
```

## Network Notes

Aurora does not publish outbound IP addresses. It sends from its `*.aurorasolar.com` domain, which
you can use for a DNS allowlist, but the header token is the practical check.
