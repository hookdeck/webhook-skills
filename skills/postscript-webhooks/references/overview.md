# Postscript Webhooks Overview

## What Are Postscript Webhooks?

Postscript is an SMS marketing platform for Shopify. It sends HTTPS `POST` requests with a JSON
payload to an endpoint you choose when events happen in a shop. Requests are not signed. Each one
carries a `Postscript-Signature` header containing the account's webhook signing token (not an
HMAC of the body), which you compare with the token from `GET /api/v2/webhooks/token`.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `shop.incoming_message` | A shop gets an inbound text message (keywords and subscriber lifecycle messages may not come through) | Reply via the Send Message API, support routing |
| `shop.subscriber.opt_in` | A subscriber opts in to promotional texts (most often by confirming with a reply) | Sync to CRM, start a welcome flow |
| `shop.subscriber.opt_out` | A subscriber opts out of texts | Suppress in other channels |
| `shop.email_collected` | An email is collected through a Postscript popup | Add to email list |

Postscript may add event types at any time. Acknowledge events you don't handle.

## Event Payload Structure

```json
{
  "webhook_id": "89066f0a-eb36-4ed8-b98c-606e6dcac715",
  "resource_type": "shop",
  "resource_id": "shop_1234567abcd",
  "event_time": "2021-11-04T21:52:41.025455",
  "event": "shop.incoming_message",
  "event_data": {
    "id": "im_1b2a005a386281c9",
    "subscriber_id": "s_1234567abcd",
    "shop_id": "shop_1234567abcd",
    "is_opt_out": false,
    "shopify_customer_id": null,
    "from_number": "+15555555555",
    "created_at": "2021-11-04T21:52:41.025455",
    "body": "Hello, world"
  }
}
```

- `event` - the event type from the table above
- `resource_type` - `shop`
- `event_data` - event-specific data

## Delivery and Retries

Respond `200` (the body is ignored), ideally before doing any complex work. If Postscript doesn't
get a `200`, or the response is slow, it retries every 5 minutes for up to 1 hour. The same event
can be delivered more than once, so make the handler idempotent (for example by `webhook_id`).

## Full Event Reference

See [Postscript's webhook documentation](https://developers.postscript.io/docs/configuring-webhooks)
and [Type of Events](https://developers.postscript.io/reference/webhook-events).
