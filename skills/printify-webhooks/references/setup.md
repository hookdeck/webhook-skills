# Setting Up Printify Webhooks

## Prerequisites

- A Printify shop and its `shop_id` (`GET /v1/shops.json`)
- An API access token with the `webhooks.read` and `webhooks.write` scopes
- A public HTTPS endpoint (use `npx hookdeck-cli listen` during development)

Printify webhooks are managed **only through the API**.

## How Do I Create a Webhook and Set a Secret?

Generate a secret, then create one webhook per topic:

```bash
SECRET=$(openssl rand -hex 20)

curl -X POST "https://api.printify.com/v1/shops/$SHOP_ID/webhooks.json" \
  -H "Authorization: Bearer $PRINTIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"topic\":\"order:created\",\"url\":\"https://example.com/webhooks/printify\",\"secret\":\"$SECRET\"}"
```

- `topic` is required and can't be changed later.
- `secret` is optional in the API but **set it**: unsigned webhooks can't be verified.
- Repeat the call for each topic: `order:created`, `order:updated`, `order:sent-to-production`, `order:shipment:created`, `order:shipment:delivered`, `product:publish:started`, `product:deleted`, `shop:disconnected`, and any others you need.
- Use the same secret for all of them and store it as `PRINTIFY_WEBHOOK_SECRET`.

Other endpoints: `GET /v1/shops/{shop_id}/webhooks.json` (list), `PUT .../webhooks/{webhook_id}.json` (modify), `DELETE .../webhooks/{webhook_id}.json?host={host}` (delete).

## How Do I Test a Webhook?

Call the simulate endpoint; whatever you send as the body comes back in the delivered payload:

```bash
curl -X POST "https://api.printify.com/v1/shops/$SHOP_ID/webhooks/$WEBHOOK_ID/simulate" \
  -H "Authorization: Bearer $PRINTIFY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"anything":"test"}'
```

## Local Development

```bash
npx hookdeck-cli listen 3000 printify --path /webhooks/printify
```

Use the printed URL as the webhook `url`. For FastAPI, use port `8000`.

## Delivery Rules

- Respond `200 OK` quickly.
- On `4xx`/`5xx`, Printify retries up to 3 times, then blocks the webhook for 1 hour with no deliveries.
