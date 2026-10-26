# Setting Up Egnyte Webhooks

## Prerequisites

- An Egnyte domain and a registered Egnyte developer app that can obtain an OAuth 2.0 token
  with the `Egnyte.webhooks` scope
- A public HTTPS endpoint with a CA-signed certificate (use the Hookdeck CLI locally)

## How Do I Choose the authHeader?

Egnyte has no dashboard screen for webhooks; you register them through the API. The
`authHeader` field is optional, but **without it Egnyte sends nothing to verify**, so always
set it. Pick a long random secret and decide the exact string, for example
`Bearer secret-token-12345` (the docs' example), and store that same full string as
`EGNYTE_AUTHORIZATION`.

Paste the authHeader value exactly as set on the Egnyte webhook, including any "Bearer " prefix.

The same rule applies in Hookdeck: the Egnyte source's key is that full value. Your handler
compares the whole `Authorization` header to it, so don't strip the scheme prefix.

## Register Your Endpoint

```bash
curl -i -X POST "https://{domain}.egnyte.com/pubapi/v1/webhooks" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/egnyte",
    "eventType": ["fs:add_file", "fs:delete_file", "link:create"],
    "path": "/Shared/Documents",
    "authHeader": "Bearer secret-token-12345"
  }'
```

- `url` (required): HTTPS endpoint.
- `eventType`: exact names or wildcards such as `fs:*`. Omitting it subscribes to everything,
  which Egnyte doesn't recommend.
- `path`: comma-separated folder paths, up to 100. Omit to watch all paths.
- `authHeader`: the credential Egnyte returns in the `Authorization` header.

The response is `201 Created` with `webhookId`, `expires` and `status`.

## Check, Change and Re-enable a Webhook

- `GET /pubapi/v1/webhooks/{webhookId}/details` shows the configuration, including `authHeader`.
- `PUT /pubapi/v1/webhooks/{webhookId}` updates `url`, `eventType`, `path`, `authHeader`, `status`.
  Use it to rotate the credential.
- `POST /pubapi/v1/webhooks/{webhookId}/status` with `{"status": "enabled"}` re-enables a
  webhook that Egnyte disabled after failed deliveries.

## Local Testing

```bash
npx hookdeck-cli listen 3000 egnyte --path /webhooks/egnyte
```

Register the printed URL as the webhook `url`. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/egnyte \
  -H "Content-Type: application/json" \
  -H "Authorization: $EGNYTE_AUTHORIZATION" \
  -d '{"data":[{"eventId":"evt-1","domain":"apidemo","timestamp":1710000000000,"eventType":"fs:add_file","webhookId":"c9ac0519-284a-4bee-9574-30ae7891e5dc","data":{"targetPath":"/Shared/Documents/a.txt"}}]}'
```
