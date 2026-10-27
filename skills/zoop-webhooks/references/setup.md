# Setting Up Zoop Webhooks

## Prerequisites

- A Zoop marketplace with API access (your `marketplace_id` and API credentials)
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## What Do I Set for the Authorization Value?

Set an authorization value when you create the webhook through the Zoop API, then paste the same value here.

Choose any unique string (a long random value). Zoop stores it with the webhook and sends it
back unchanged in the `Authorization` header of every delivery. Put the exact same string in
`ZOOP_AUTHORIZATION`. If you include a scheme such as `Bearer ` in the string, it is sent and
must be part of `ZOOP_AUTHORIZATION` too: Zoop adds nothing itself.

## Create the Webhook

```bash
curl --location --request POST "https://api.zoop.ws/v1/marketplaces/$MARKETPLACE_ID/webhooks" \
  --header 'Content-Type: application/json' \
  --data-raw '{
    "url": "https://example.com/webhooks/zoop",
    "method": "POST",
    "event": ["transaction.succeeded", "transaction.failed"],
    "authorization": "xxxxxxxxxxxx"
  }'
```

(Add your Zoop API authentication as described in the
[API reference](https://docs.zoop.co/reference/post_v1-marketplaces-marketplace-id-webhooks).)
Webhooks can also be registered from the Zoop dashboard. The URL must be public.

## Activation (the ping)

Right after creation Zoop sends a `ping` event. Return `200`. Only then does the webhook become
`active`. Zoop's docs don't say whether the ping carries your `Authorization` header, and the
examples require it on every request, so confirm on a real ping: if your logs show a 401 for it,
the ping arrived without the header. If the webhook stays `registred`, the ping was rejected or
unreachable: check the URL and that `ZOOP_AUTHORIZATION` matches, then list the marketplace
webhooks and look at `status`.

## Choose Events

List the event types to receive in `event`, for example `transaction.succeeded`,
`transaction.failed`, `transaction.canceled`, `seller.activated`, `bank_account.associated`.

## Local Testing

```bash
npx hookdeck-cli listen 3000 zoop --path /webhooks/zoop
```

Use the printed URL as the webhook `url`. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/zoop \
  -H "Content-Type: application/json" \
  -H "Authorization: $ZOOP_AUTHORIZATION" \
  -d '{"id":"evt_1","resource":"event","type":"ping","payload":{"object":{"ping":"true"}}}'
```
