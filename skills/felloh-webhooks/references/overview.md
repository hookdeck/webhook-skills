# Felloh Webhooks Overview

## What Are Felloh Webhooks?

Felloh provides payments and trust-account infrastructure for UK travel businesses. A webhook tells your system when something changes in Felloh so you don't have to poll the API. Each webhook is registered in the dashboard (Developer Configuration) with a URL, the events to listen for and, optionally, child organisations.

## Common Event Types

Felloh does not put an event name in the body or in a header. The events are selected at registration time, and a delivery is recognised by the shape of its JSON. The labels below are used by this skill and by Hookdeck's sample payloads; they are not values Felloh sends.

| Event (label) | Triggered When | Common Use Cases |
|---------------|----------------|------------------|
| `transaction-status` | A transaction changes status | Mark an order paid, reconcile payments |
| `refund-status` | A refund changes status | Update refund state, notify the customer |
| `booking` | A booking is created | Sync bookings into your CRM |
| `user-create` | A Felloh user is created | Provision access, audit new users |

## Event Payload Structure

All payloads are JSON objects. Amounts are integers in minor units (`GBX` is pence).

`transaction-status`:

```json
{
  "amount": 10000,
  "booking": { "id": "3d38e53b-867a-43bd-ad5d-4af786dd1b33", "booking_reference": "test-123" },
  "completed_at": "2021-11-03T11:04:27.000Z",
  "currency": "GBX",
  "payment_link": { "id": "2cc9b939-d2fa-41e5-abae-39c377236978" },
  "ecommerce": { "id": null },
  "provider": { "name": "nuvei", "reference": "93216A82FBDD1696203B7FC6099A9B66.prod02-vm-tx94" },
  "status": "COMPLETE",
  "transaction": { "id": "2cc9b939-d3fa-41e5-acae-39c377236978" },
  "surcharge": { "surcharge_applied": true, "amount": 100, "currency": "GBX" }
}
```

`refund-status` has `authorisation_code`, `actioned_at`, `amount`, `metadata`, a `status` **object** (`{ "id": "PENDING_AUTHORISATION" }`) and a `transaction` object that carries the `booking` reference. `booking` has a `booking` object, `customer_name`, `email`, `amount`, `currency`, `departure_date`, `return_date`, `customer`, `created_at` and `deleted_at`. `user-create` has a `user` object, `email`, `first_name`, `last_name`, `status`, `is_api_user`, `organisation` and `created_at`.

How the examples classify a delivery (after verifying the signature):

1. `user` is an object: `user-create`
2. `transaction` and `status` are both objects: `refund-status`
3. `transaction` is an object and `status` is a string: `transaction-status`
4. `booking` is an object and there is no `transaction`: `booking`

Anything else is acknowledged and logged as unhandled. Treat every field as untrusted and check types before reading into nested objects.

## Delivery and Retries

- A non-2xx response is a failure; the timeout is 30 seconds.
- Transaction status events are retried up to 5 times, about a minute apart.
- Refund, booking and user events are sent once with no retry.
- Test deliveries from the dashboard carry `X-Felloh-Test: true` and are never retried.
- Delivery logs are kept for 30 days.

## Full Event Reference

See [Felloh's webhook documentation](https://developers.felloh.com/webhooks).
