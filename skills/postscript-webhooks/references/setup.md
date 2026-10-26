# Setting Up Postscript Webhooks

## Prerequisites

- A Postscript account and its API token (shops send it in the `Authorization` header; partners use
  `X-Postscript-Shop-Token`)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 postscript --path /webhooks/postscript` locally)

## Get Your Webhook Signing Token

Call the [Get Webhook Signing Token](https://developers.postscript.io/reference/get-webhook-signing-token) endpoint:

```bash
curl --request GET \
  --url https://api.postscript.io/api/v2/webhooks/token \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer [API TOKEN]'
```

Store the returned token as `POSTSCRIPT_WEBHOOK_TOKEN`. Postscript sends this same value in the
`Postscript-Signature` header of every webhook for the account.

**Hookdeck:** when you create a Postscript source, paste the token returned by
`GET /api/v2/webhooks/token`.

## Register Your Endpoint

Create one subscription per event with `POST /api/v2/webhooks`:

```bash
curl --request POST \
  --url https://api.postscript.io/api/v2/webhooks \
  --header 'Accept: application/json' \
  --header 'Authorization: Bearer [API TOKEN]' \
  --header 'Content-Type: application/json' \
  --data '{"callback_url": "https://example.com/webhooks/postscript", "event": "shop.subscriber.opt_in"}'
```

Repeat for each event you need: `shop.incoming_message`, `shop.subscriber.opt_in`,
`shop.subscriber.opt_out`, `shop.email_collected` (the API also accepts `shop.test`, its default).
The body can include an optional `headers` object: "Custom key:value pairs to be sent as headers in
every callback" (e.g. `"headers": {"X-My-Secret": "<random value>"}`).

## Test

- Send a text to the shop and watch for `shop.incoming_message`, or
- Call the [Test Shop Webhook](https://developers.postscript.io/reference/test-shop-webhook) endpoint.

Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/postscript \
  -H "Content-Type: application/json" \
  -H "Postscript-Signature: $POSTSCRIPT_WEBHOOK_TOKEN" \
  -d '{"webhook_id":"w1","resource_type":"shop","resource_id":"shop_1","event":"shop.subscriber.opt_in","event_data":{}}'
```
