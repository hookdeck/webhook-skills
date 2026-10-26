# Setting Up PingOne Webhooks

## Prerequisites

- A PingOne environment, and an admin role that can manage subscriptions (webhooks)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 pingone --path /webhooks/pingone` locally)

## Choose Your Header Value

PingOne doesn't generate a secret. You choose a header name and value, and PingOne sends them
on every request. Generate a long random value:

```bash
openssl rand -hex 32
```

Store the header name as `PINGONE_WEBHOOK_HEADER` (default `Authorization`) and the **exact whole
value** as `PINGONE_WEBHOOK_SECRET`. If you set `Authorization: Bearer abc123`, the secret is
`Bearer abc123`, prefix included. **Paste the exact header value you set on the subscription.**

## Register Your Endpoint

Create a subscription in the PingOne admin console (see *Webhooks* in the PingOne Admin Guide) or
with the API (`POST /environments/{envID}/subscriptions`). The docs list `httpEndpoint.headers` as
header name/value pairs, for example `"Authorization": "Basic username:password"`:

```json
{
  "name": "Audit events to my app",
  "enabled": true,
  "format": "ACTIVITY",
  "httpEndpoint": {
    "url": "https://example.com/webhooks/pingone",
    "headers": { "Authorization": "Bearer <your-secret>" }
  },
  "filterOptions": {
    "includedActionTypes": ["USER.CREATED", "USER.UPDATED", "AUTHENTICATION.CREATED"]
  },
  "verifyTlsCertificates": true,
  "payloadOptions": {
    "payloadFormat": { "https": { "format": "JSON_ARRAY" } }
  }
}
```

- `format` is `ACTIVITY` (generic JSON). `payloadOptions.payloadFormat.https.format` is `JSON_ARRAY` or
  `ND_JSON`, and `payloadOptions.maximumPayloadLimit` caps the batch (1 to 500 events, default 500); the examples accept both.
- `includedActionTypes` is required and non-empty. Subscribe only to events you handle.
- PingOne also supports outbound mutual TLS (`tlsClientAuthKeyPair`). These examples rely on the
  header instead.

## Test

Trigger a matching action (create a user in the environment) and check that your endpoint logs
`USER.CREATED`. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/pingone \
  -H "Content-Type: application/json" \
  -H "Authorization: $PINGONE_WEBHOOK_SECRET" \
  -d '[{"id":"evt-1","action":{"type":"USER.CREATED"},"actors":{"user":{"name":"jane"}}}]'
```

If the target stays offline PingOne keeps retrying the same event; fix the endpoint and the
backlog is delivered (events older than about 7 days may be lost).
