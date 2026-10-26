# Setting Up Prometheus Alertmanager Webhooks

## Prerequisites

- A running Alertmanager you can edit (`alertmanager.yml`)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 prometheus-alertmanager --path /webhooks/prometheus-alertmanager` locally)

Setup note (same as Hookdeck's Prometheus Alertmanager source): "Set basic_auth, or authorization with the default Bearer type, in the webhook receiver's http_config. OAuth 2.0 is not supported."

## Get Your Secret

Alertmanager has no dashboard and generates nothing: you choose the secret. Create a long random
value, store it in a file for Alertmanager and in `ALERTMANAGER_WEBHOOK_SECRET` for your endpoint.
Store the bare secret, without a `Bearer ` prefix.

## Register Your Endpoint

Add a receiver to `alertmanager.yml` and route alerts to it:

```yaml
route:
  receiver: hookdeck

receivers:
  - name: hookdeck
    webhook_configs:
      - url: https://example.com/webhooks/prometheus-alertmanager
        send_resolved: true
        http_config:
          authorization:
            type: Bearer                                  # the default
            credentials_file: /etc/alertmanager/webhook-secret
```

`credentials_file` holds just the secret; Alertmanager sends `Authorization: Bearer <secret>`.
`credentials` works too but puts the secret in the config file. Reload Alertmanager afterwards
(`SIGHUP` or `POST /-/reload`).

## basic_auth Also Works, With a Caveat

`http_config.basic_auth` sends `Authorization: Basic <base64(user:password)>`. Hookdeck's source
first compares the whole header to the stored value, so it only works there if you store the whole
`Basic ...` value as the secret. The examples in this skill cover the Bearer form.

## oauth2 Is Not Supported

`http_config.oauth2` fetches tokens from an authorization server; this skill and Hookdeck's source
don't handle it. Use `authorization` or `basic_auth`.

## Test

Send a notification with curl, or use `amtool` / Prometheus to trigger an alert:

```bash
curl -X POST http://localhost:3000/webhooks/prometheus-alertmanager \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALERTMANAGER_WEBHOOK_SECRET" \
  -d '{"version":"4","groupKey":"{}:{alertname=\"HighCPU\"}","status":"firing","receiver":"hookdeck","alerts":[{"status":"firing","labels":{"alertname":"HighCPU"},"annotations":{},"startsAt":"2026-10-26T10:00:00Z","endsAt":"0001-01-01T00:00:00Z","fingerprint":"1a2b3c4d5e6f7a8b"}]}'
```

## Delivery Notes

Alertmanager retries failed notifications, so return a 2xx promptly and process asynchronously.
