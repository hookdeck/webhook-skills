# Setting Up Prometheus Alertmanager Webhooks

## Prerequisites

- A running Alertmanager you can edit (`alertmanager.yml`)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 prometheus-alertmanager --path /webhooks/prometheus-alertmanager` locally)

Setup note (same as Hookdeck's Prometheus Alertmanager source): "Set basic_auth, or authorization with the default Bearer type, in the webhook receiver's http_config. OAuth 2.0 is not supported."

## Get Your Credentials

Alertmanager has no dashboard and generates nothing: you choose the credentials. Pick one form for
the receiver's `http_config`:

- `authorization` (default type Bearer): create a long random secret. Store it in a file for
  Alertmanager and in `ALERTMANAGER_WEBHOOK_SECRET` for your endpoint, without a `Bearer ` prefix.
- `basic_auth`: choose a username and a long random password. Store them in
  `ALERTMANAGER_WEBHOOK_USERNAME` and `ALERTMANAGER_WEBHOOK_PASSWORD` for your endpoint.

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

## Or Use basic_auth

`http_config.basic_auth` sends `Authorization: Basic <base64(username:password)>` on every request:

```yaml
receivers:
  - name: hookdeck
    webhook_configs:
      - url: https://example.com/webhooks/prometheus-alertmanager
        send_resolved: true
        http_config:
          basic_auth:
            username: alertmanager
            password_file: /etc/alertmanager/webhook-password
```

Set `ALERTMANAGER_WEBHOOK_USERNAME` and `ALERTMANAGER_WEBHOOK_PASSWORD` to the same values. The
examples split on the first colon, so a password may contain `:`. Hookdeck never sends a 401
challenge, which is fine here: Alertmanager sends the credentials with every request.

## Hookdeck

Hookdeck's Prometheus Alertmanager source offers two methods. Pick the one that matches the
receiver:

- **Basic auth** (the default): for `basic_auth`. Enter the username and password.
- **Bearer token**: for `authorization`. Enter the bare credentials, without `Bearer `.

## oauth2 Is Not Supported

`http_config.oauth2` fetches tokens from an authorization server; this skill and Hookdeck's source
don't handle it. Use `basic_auth` or `authorization`.

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
