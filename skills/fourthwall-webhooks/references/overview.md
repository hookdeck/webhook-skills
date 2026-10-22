# Fourthwall Webhooks Overview

## What Are Fourthwall Webhooks?

Fourthwall is a creator commerce platform (merch, memberships, donations, gifts). Shop webhooks send an HTTPS `POST` with a JSON body to your endpoint whenever a subscribed event happens in your shop, for example when a supporter places an order. You choose which event types each webhook subscribes to, in the dashboard or through the Platform API.

Your endpoint must reply `200 OK` quickly (within 2 seconds). Delivery is at-least-once, ordering between event types is not guaranteed, and delivery is not guaranteed at all, so reconcile periodically with the API if you need consistent data.

## Common Event Types

The event type is the `type` field in the JSON body (there is no event-type header).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ORDER_PLACED` | A new order is successfully placed and paid | Fulfilment, accounting, stream alerts |
| `ORDER_UPDATED` | An order's status, shipping address or email is updated | Sync order state, shipping notices |
| `GIFT_PURCHASE` | A gift card is purchased | Gift redemption flows |
| `DONATION` | A new donation is received | Thank-you messages, stream alerts |
| `SUBSCRIPTION_PURCHASED` | A new membership subscription is purchased | Grant access, welcome flows |
| `SUBSCRIPTION_CHANGED` | A membership is changed (e.g. tier change) | Update entitlements |
| `SUBSCRIPTION_EXPIRED` | A membership expires | Revoke access |
| `PRODUCT_CREATED` | A product is created | Catalog sync |
| `PRODUCT_UPDATED` | A product is updated | Catalog sync |

## All Event Types

`ORDER_PLACED`, `ORDER_UPDATED`, `GIFT_PURCHASE`, `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `DONATION`, `SUBSCRIPTION_PURCHASED`, `SUBSCRIPTION_EXPIRED`, `SUBSCRIPTION_CHANGED`, `NEWSLETTER_SUBSCRIBED`, `THANK_YOU_SENT`, `GIFT_DRAW_STARTED`, `GIFT_DRAW_ENDED`, `PROMOTION_CREATED`, `PROMOTION_UPDATED`, `PROMOTION_STATUS_CHANGED`, `PLATFORM_APP_DISCONNECTED`, `COLLECTION_UPDATED`, `CART_ABANDONED_1H`, `CART_ABANDONED_24H`, `CART_ABANDONED_72H`.

## Event Payload Structure

All events share this envelope:

```json
{
  "testMode": false,
  "id": "weve_geAva6c1RAuyb9HQxbSlmA",
  "webhookId": "wcon_P-VkRfmJTBaC6_Tst22cew",
  "shopId": "sh_7ad0c438-beda-4779-a885-0dc325a755c1",
  "type": "ORDER_PLACED",
  "apiVersion": "V1_BETA",
  "createdAt": "2023-07-12T15:05:11.078089+00:00",
  "data": {}
}
```

| Field | Description |
|-------|-------------|
| `testMode` | `true` for events sent by the dashboard's "Send test notification" button |
| `id` | Unique event id. A repeated `id` is a duplicate delivery |
| `webhookId` | Which webhook configuration sent the event |
| `shopId` | Your shop id (useful when one endpoint serves several shops) |
| `type` | Event type, which determines the shape of `data` |
| `apiVersion` | Version of the data type |
| `createdAt` | When the event was created |
| `data` | Event-specific object. For example `ORDER_PLACED` carries `id`, `friendlyId`, `email`, `username`, `amounts`, `offers`; `DONATION` carries `id`, `username`, `message`, `amounts`; `ORDER_UPDATED` carries `order` and `update` |

## Full Event Reference

For the complete payload schema of each event, see [Fourthwall's webhook documentation](https://docs.fourthwall.com/webhooks/getting-started) and the [Order placed](https://docs.fourthwall.com/api-reference/order-events/order-placed) API reference (each event type has its own page under the same API reference).
