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
| `Customer.Created` | A customer record is created | Add to CRM or mailing list |
| `Redemption.Created` | A ticket or voucher is redeemed | Track attendance and check-ins |
| `PaymentLink.Created` | A payment link is created | Notify staff, track outstanding payments |

## Event Payload Structure

The body is a JSON object with a `type` field holding the event name above, plus the event data.
The exact fields depend on the event; see the ROLLER API reference for each object.

```json
{
  "type": "Booking.Created"
}
```

(Only `type` is relied on by the examples; handlers read other fields defensively.)

## Full Event Reference

See [ROLLER's webhook documentation](https://docs.roller.app/docs/api/creating-webhooks).
