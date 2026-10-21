# Setting Up Heroku Webhooks

Heroku app webhooks are configured with the Heroku CLI (`heroku-cli/6.13.19` or later; run `heroku update` to upgrade). There is no dashboard form for them.

## Prerequisites

- A Heroku app (or pipeline / add-on) you can manage
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## How Do I Get the Signing Secret?

Pass `--secret` to choose your own, or omit it and the CLI generates one:

```
Adding webhook to ⬢ myapp ... done
=== Webhooks Signing Secret
475beb0bf7de962fb89878a767c22f7de22154dae1e6996b6b33299e7a0f
```

That value is shown **once** and can never be retrieved again, so persist it immediately (for example as a config var). Run `heroku webhooks:update` to set a new one. The secret is used as a raw string.

## How Do I Register an Endpoint?

```bash
heroku webhooks:add -i api:release,api:build -l notify \
  -u https://example.com/webhooks/heroku -s "$HEROKU_WEBHOOK_SECRET" -a myapp
```

| Flag | Required | Description |
|------|----------|-------------|
| `-i, --include` | Yes | Comma-separated entities, e.g. `api:app,api:release` |
| `-u, --url` | Yes | Endpoint that receives notifications |
| `-l, --level` | Yes | `notify` (no retries) or `sync` (retry until success or limit) |
| `-s, --secret` | No | Signing secret; generated if omitted |
| `-t, --authorization` | No | Value sent as the `Authorization` header on each request |
| `-a, --app` | No | App name |

Other commands: `heroku webhooks` (list), `heroku webhooks:remove`, `heroku webhooks:deliveries` (delivery log), `heroku webhooks:deliveries:info DELIVERY_ID`.

## Local Development

```bash
npx hookdeck-cli listen 3000 heroku --path /webhooks/heroku
```

Use the Hookdeck URL it prints as the `-u` value.

## Testing

Trigger a real event (for example `heroku config:set FOO=bar` creates a release) and inspect results with `heroku webhooks:deliveries`. Deliveries have status `pending`, `success`, `failure`, or `skipped`.
