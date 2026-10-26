# Setting Up Trendyol Webhooks

## Prerequisites

- A Trendyol seller account with API credentials (the same ones used for the marketplace APIs)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 trendyol --path /webhooks/trendyol` locally)
- A URL that does not contain "Trendyol", "Dolap" or "Localhost"

## Choose an API Key

> Choose API key authentication (authenticationType API_KEY) when you create the Trendyol webhook.

Trendyol supports two authentication types, `BASIC_AUTHENTICATION` and `API_KEY`. Hookdeck's
Trendyol source does not cover Basic authentication, and this skill doesn't either. Pick a long
random string for `apiKey` and store it as `TRENDYOL_WEBHOOK_SECRET`.

## Register Your Endpoint

Webhooks are created through the Trendyol API ([Webhook Yaratma](https://developers.trendyol.com/docs/webhook-yaratma)):
`POST https://apigw.trendyol.com/integration/webhook/sellers/{sellerId}/webhooks` (production) or
`https://stageapigw.trendyol.com/integration/webhook/sellers/{sellerId}/webhooks` (stage). The
request itself uses Basic authentication with your sellerId, API key and API secret from
**Hesap Bilgilerim > Entegrasyon Bilgileri** in the seller panel. Set `authenticationType` to
`API_KEY` and send the `apiKey`; `username` and `password` aren't needed:

```json
{
  "url": "https://example.com/webhooks/trendyol",
  "authenticationType": "API_KEY",
  "apiKey": "your-webhook-api-key",
  "subscribedStatuses": ["CREATED", "SHIPPED", "DELIVERED"]
}
```

If `subscribedStatuses` is empty, all statuses are subscribed (including any added later). The
response is `{ "id": "..." }`, the webhook ID you need to update, delete or deactivate it.
Trendyol then sends the `apiKey` in the `x-api-key` header.

## Test Mode vs Live Mode

Trendyol has separate test (stage) and production environments with their own credentials.
Create the webhook in each environment you use.

## Reactivating

If your endpoint keeps failing, Trendyol deactivates the webhook and emails you. Fix the endpoint,
then reactivate it with the activate/deactivate service.

## Test

```bash
curl -X POST http://localhost:3000/webhooks/trendyol \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TRENDYOL_WEBHOOK_SECRET" \
  -d '{"content":[{"orderNumber":"10654411111","shipmentPackageId":3330111111,"status":"Delivered"}]}'
```
