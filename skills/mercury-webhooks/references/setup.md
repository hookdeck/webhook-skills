# Setting Up Mercury Webhooks

## Prerequisites

- A Mercury account with an API token (Mercury dashboard → Settings → API tokens). Send it as `Authorization: Bearer <token>`.
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

Webhook endpoints are created through the API:

```bash
curl -X POST https://api.mercury.com/api/v1/webhooks \
  -H "Authorization: Bearer $MERCURY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/webhooks/mercury",
    "eventTypes": ["transaction.created", "transaction.updated"]
  }'
```

- `url` (required): the HTTPS URL that receives events.
- `eventTypes` (optional): any of `transaction.created`, `transaction.updated`, `checkingAccount.balance.updated`, `savingsAccount.balance.updated`, `treasuryAccount.balance.updated`, `investmentAccount.balance.updated`, `creditAccount.balance.updated`. Omit to receive all.
- `filterPaths` (optional): field paths such as `["status", "amount"]`. Events are sent only when one of these fields changes.

## Get Your Signing Secret

The response includes the endpoint's `secretKey`. **Mercury returns it only on creation**, so store it right away as `MERCURY_WEBHOOK_SECRET`. Use it exactly as returned; do not base64-decode it or strip a prefix. If you lose it, create a new endpoint.

## Testing

Send a test event with the verify call. It defaults to `transaction.created`; pass `eventType` to test another:

```bash
curl -X POST https://api.mercury.com/api/v1/webhooks/$WEBHOOK_ID/verify \
  -H "Authorization: Bearer $MERCURY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"eventType": "transaction.updated"}'
```

For local development:

```bash
npx hookdeck-cli listen 3000 mercury --path /webhooks/mercury
```

Use the Hookdeck URL as the endpoint `url`.

## Managing Endpoints

`GET /webhooks` lists endpoints, `POST /webhooks/{id}` updates one (including `status`: `active` or `paused`), and `DELETE /webhooks/{id}` removes it. An endpoint disabled after consecutive delivery failures is reactivated by setting `status` to `active`.
