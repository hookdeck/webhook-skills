# Setting Up Check Webhooks

## Prerequisites

- A Check account with an API key (sandbox keys work for development)
- Your application's webhook endpoint URL

## Create a Webhook Config and Get the Key

Webhook Configs are created through the API. The response includes the `key` used to sign every request.

```bash
curl -X POST https://sandbox.checkhq.com/webhook_configs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-app.com/webhooks/check-hq"}'
```

```json
{ "id": "whc_KsfGVBkOJnF3S3OmYVLJ", "url": "https://your-app.com/webhooks/check-hq", "key": "4f541ff5350323b6ba6ca4e96873e6f4cb9fd144" }
```

Store `key` as `CHECK_WEBHOOK_KEY`. You can read it again with `GET /webhook_configs`.

Options on a config:

- `active` - set `false` via `PATCH /webhook_configs/{id}` to pause (events generated while paused are not sent later)
- `api_version` - pin the payload shape to an API version
- Multiple configs are allowed and each receives every webhook

## Send a Test Ping

```bash
curl --request POST \
  --url https://sandbox.checkhq.com/webhook_configs/WEBHOOK_CONFIG_ID/ping \
  --header 'Authorization: Bearer YOUR_API_KEY'
```

Your endpoint receives `{"message": "Test webhook"}` with a valid `Check-Signature` and `Check-Topic: ping`.

## Sandbox vs Live

Configs created in sandbox (`sandbox.checkhq.com`) receive sandbox events only; live configs (`api.checkhq.com`) receive live events only. Each has its own key. `Check-Live` tells you which one sent the request.

## Optional: IP Allowlist

Check documents these source IPs: `44.195.7.1`, `3.228.118.62`, `52.0.144.131`. Signature verification is still required.

## Local Development

```bash
npx hookdeck-cli listen 3000 check-hq --path /webhooks/check-hq
```

Use the Hookdeck URL as the Webhook Config `url`.
