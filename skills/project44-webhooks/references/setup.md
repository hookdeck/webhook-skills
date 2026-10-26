# Setting Up project44 Webhooks

## Prerequisites

- A project44 developer account with API access (OAuth 2.0 token for the project44 API)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 project44 --path /webhooks/project44` locally)
- A secret value you generate for the authentication header

## Choose Your Secret

Generate a random value, for example `openssl rand -hex 32`, and store it as
`PROJECT44_WEBHOOK_SECRET`. Pick a header name and store it as `PROJECT44_WEBHOOK_HEADER`
(the examples default to `X-Api-Key`). Use plain ASCII. The secret is compared as the **whole
header value**, so if you put `Bearer abc` in the configuration, `PROJECT44_WEBHOOK_SECRET` must be
`Bearer abc`.

## Register Your Endpoint

Send `PUT /api/v4/webhooks` with an `API_KEY` authentication method (see the
[Webhook Guide](https://developers.project44.com/api-reference/webhook-guide)):

```json
{
  "configName": "my-shipment-events",
  "url": "https://example.com/webhooks/project44",
  "method": "POST",
  "methodParams": {},
  "authType": "API_KEY",
  "authenticationMethods": [
    {
      "type": "API_KEY",
      "parameters": { "api_key_name": "X-Api-Key", "api_key": "<your secret>" }
    }
  ],
  "webhookConfiguration": { "webhookEventType": "shipments.v1.event.added" }
}
```

Notes:

- The docs describe the value field as `api_key_value`, but their example payload uses `api_key`.
  Follow the example, and check the response if the header doesn't arrive.
- A header is created for each key (max 2).
- `webhookConfiguration.webhookEventType` selects a granular webhook. Create one configuration per
  event type you need.
- `method` can be `GET`, `POST`, `PUT` or `PATCH` (default `POST`). If you receive through
  Hookdeck, its project44 source pre-selects only `POST`: allow any other method you use on the source.
- Once the configuration exists, contact your project44 representative to complete the setup.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/project44 \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $PROJECT44_WEBHOOK_SECRET" \
  -d '{"eventId":"1","eventType":"shipments.v1.shipment.created","dataType":"Shipment","context":{"shipment":{"shipmentId":"abc"}},"data":{}}'
```

## Network Notes

Rely on HTTPS plus the header; the docs don't publish a fixed IP range to allowlist.
