# Setting Up Stuart Webhooks

## Prerequisites

- A Stuart client account (Sandbox and Production have separate accounts and settings)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 stuart --path /webhooks/stuart` locally)

## Choose Your Authentication Header and Key

Pick a header name that starts with `X-` and a long random value, for example:

```
Webhook authentication header: X-Webhook-Secret
Webhook authentication key:    9f2c7e1d5b8a4c3e9f2c7e1d5b8a4c3e
```

Store them as `STUART_WEBHOOK_HEADER` and `STUART_WEBHOOK_SECRET`. The secret is the exact whole
header value Stuart will send. If you type `Bearer abc123` as the key, the header value is
`Bearer abc123` and `STUART_WEBHOOK_SECRET` must be `Bearer abc123`.

## Register Your Endpoint

### In the Stuart admin page

1. Open the Stuart admin page (Sandbox or Production) and go to the webhook settings.
2. Add your URL, e.g. `https://example.com/webhooks/stuart`.
3. Choose version `v3` and the topics you want (see [overview.md](overview.md)).
4. Enter the *Webhook authentication header* and *Webhook authentication key*.

### Through the webhook API

```bash
curl -X POST https://api.sandbox.stuart.com/v2/webhooks \
  -H "Authorization: Bearer $STUART_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/stuart",
    "version": "v3",
    "topics": ["package_created", "courier_assigned", "package_delivered", "package_canceled"],
    "enabled": true,
    "authentication_header": "X-Webhook-Secret",
    "authentication_key": "9f2c7e1d5b8a4c3e9f2c7e1d5b8a4c3e"
  }'
```

Use `PUT /v2/webhooks/{id}` to change the header, key or topics, and `GET`/`DELETE` to list or
remove subscriptions. The production API host is `api.stuart.com`.

## Test

Create a job in Sandbox and watch your endpoint log `package_created`. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/stuart \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $STUART_WEBHOOK_SECRET" \
  -d '{"version":"v3","event_id":"1","webhook_id":1,"topic":"package_created","details":{"package":{"id":"1","reference":"r1"}}}'
```

## Network Notes

Stuart recommends relying on DNS resolution rather than IP allowlisting. If you must allowlist,
Stuart publishes the source IPs in its docs (Sandbox: 34.254.62.41, 54.194.139.211,
54.195.221.43; Production: 108.128.110.19, 54.171.243.90, 52.51.60.65). Check the docs for the
current list.
