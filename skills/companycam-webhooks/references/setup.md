# Setting Up CompanyCam Webhooks

## Prerequisites

- A CompanyCam account and an API access token (OAuth bearer token)
- A publicly reachable HTTPS endpoint, e.g. `https://your-domain.com/webhooks/companycam`

## Set a Token (required for signed deliveries)

Set a token when you create the CompanyCam webhook. The `token` parameter is optional on
create, but without one, deliveries are unsigned and fail verification. The token is the HMAC
key for the `X-CompanyCam-Signature` header.

If you use Hookdeck, set the token on the CompanyCam webhook and use the same value as the
source's webhook secret; without it, deliveries are unsigned and verification fails.

## Register Your Endpoint

```bash
curl -X POST https://app.companycam.com/public_api/v1/webhooks \
  -H "Authorization: Bearer $COMPANYCAM_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook": {
      "url": "https://your-domain.com/webhooks/companycam",
      "scopes": ["project.created", "photo.created"],
      "token": "a-long-random-secret"
    }
  }'
```

1. `scopes` are the events to receive (for example `photo.created`, `project.created`,
   `task.completed`, or a wildcard such as `photo.*`).
2. Store `token` as `COMPANYCAM_WEBHOOK_TOKEN`. Never commit it.
3. `authorization_header` is an optional field you can also set on the webhook.

Inspect delivery attempts (retained for 30 days) with
`GET /public_api/v1/webhooks/{webhook_id}/deliveries`.

## Delivery, Retries & Auto-Disable

Respond with exactly `200`. Anything else is retried with exponential backoff (max 10
attempts); more than 25 errors disables the webhook. Acknowledge quickly and process
asynchronously.

## Local Development

```bash
npx hookdeck-cli listen 3000 companycam --path /webhooks/companycam
```

Use the printed HTTPS URL as the webhook `url`.

## Documentation

- [CompanyCam webhooks](https://developers.companycam.com/webhooks)
- [OpenAPI spec](https://developers.companycam.com/openapi/public_api_v1.yaml)
- [Legacy webhooks guide (scopes)](https://companycam.readme.io/docs/webhooks-1)
