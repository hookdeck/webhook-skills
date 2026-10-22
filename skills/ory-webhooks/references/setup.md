# Setting Up Ory Actions Webhooks

## Prerequisites

- An Ory Network project (Ory Console access)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 ory --path /webhooks/ory` locally)

## Create the Action

1. In the Ory Console go to **Authentication → Actions & Webhooks** and click **+ Create new Action**.
2. Choose the flow type (login, registration, settings, ...) and when it runs (for example **after**).
   For the after phase you can pick the authentication methods that trigger it.
3. Enter the endpoint URL and the **HTTP method** (`POST`, `PUT`, `PATCH`, ...).
4. On the next screen set the authentication and the request body, then **Create action**.

## Authentication (api_key in a header)

Choose API key authentication, put it `in: header`, and pick a header name and a secret value.
As configuration:

```yaml
hook: web_hook
config:
  url: https://example.com/webhooks/ory
  method: POST
  body: base64://ENCODED_JSONNET
  response:
    ignore: true          # non-blocking: Ory doesn't wait for or use the response
  auth:
    type: api_key
    config:
      name: Authorization       # -> ORY_WEBHOOK_HEADER
      value: your-secret        # -> ORY_WEBHOOK_SECRET (exact whole header value)
      in: header
```

Set `ORY_WEBHOOK_HEADER` to `name` and `ORY_WEBHOOK_SECRET` to `value`, exactly. If you typed
`Bearer abc123` as the value, the secret is `Bearer abc123`. `in: cookie` isn't covered here.

## Request Body (Jsonnet)

Use a template over `ctx`. This illustrative one sends an `event` name the examples dispatch on:

```jsonnet
function(ctx) { event: 'registration.after', identity: ctx.identity }
```

`ctx.identity` is bound only on after-flow hooks. Create one action per event and change the
`event` string for each. Think about what personal data you really need to send.

## Test

Register a test user and check that your endpoint logs `Identity registered`. Or replay by hand:

```bash
curl -X POST http://localhost:3000/webhooks/ory \
  -H "Content-Type: application/json" \
  -H "Authorization: $ORY_WEBHOOK_SECRET" \
  -d '{"event":"registration.after","identity":{"id":"abc"}}'
```

## Network Notes

If you use a firewall allowlist, Ory publishes its Network IP addresses. The credential header
is still the main check.
