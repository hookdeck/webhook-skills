# ROLLER Webhooks Overview

## What Are ROLLER Webhooks?

ROLLER is venue and attraction ticketing software. Its REST API lets you register webhooks that
POST a JSON payload to a URL you choose when something happens (bookings, customers,
redemptions, payment links). Deliveries are not signed; each one carries an `x-roller-apikey`
header with the `authentication.apiKey` you set when registering the webhook.

All webhooks are `POST` requests. Acknowledge within 10 seconds.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Booking.Created` | A booking is created | Confirm, sync to CRM or capacity planning |
| `Booking.Updated` | A booking is changed | Update the downstream record |
| `Booking.Cancelled` | A booking is cancelled | Release capacity, trigger refunds |
| `Customer.Created` | A guest is created (`type: Customer`) | Add to CRM or mailing list |
| `Redemption.Created` | A ticket is redeemed | Track attendance and check-ins |
| `PaymentLink.Created` | A payment link is created | Notify staff, track outstanding payments |

## Event Payload Structure

The body is a `WebhookMessageDefinition` JSON object. The event is identified by two fields:
`type` is the payload type (`Booking`, `Redemption`, `Customer`, `BulkExport`, `SignedWaiver`,
`PaymentLink`) and `eventType` is the action (`Created`, `Updated`, `Cancelled`). ROLLER never
sends a combined string; the dotted names in the table above are `type` and `eventType` joined
with a dot, which is what the examples dispatch on. `data` holds the type's payload model.

```json
{
  "id": "67d2ada6-10cc-4177-909d-430f3b2593d4",
  "sendDate": "2024-06-14T05:30:48.1597733Z",
  "type": "Booking",
  "eventType": "Created",
  "eventDate": "2024-06-14T05:30:48.1132441Z",
  "data": {}
}
```

(Field names and example values are from the `WebhookMessageDefinition` model; ROLLER publishes no
delivered example. Only `type` and `eventType` are relied on by the examples.)

## Full Event Reference

See [ROLLER's webhook documentation](https://docs.roller.app/docs/api/creating-webhooks).
