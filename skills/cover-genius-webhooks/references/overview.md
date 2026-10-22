# Cover Genius Offers Webhooks Overview

## What Are Cover Genius Offers Webhooks?

Cover Genius (XCover) is an embedded insurance platform. The Offers API notifies a partner
when a booking or a policy renewal changes by sending an HTTP `POST` with a JSON body to a
listener URL you register. Partners use these webhooks to send customer notifications, start a
renewal process, or run custom logic.

This skill covers **Offers** webhooks only. XClaim webhooks (`XClaim-Signature`) and
RentalCover webhooks (`X-Signature` plus a timestamp) use other schemes and aren't covered.

Every Offers webhook includes your authentication key in plain text in the `X-Api-Key` header.
There is no payload signature. See [verification.md](verification.md).

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `BOOKING_CREATED` | An Offer is confirmed through an API request | Send the customer confirmation, store the policy ID |
| `BOOKING_UPDATED` | A confirmed Offer is updated through an API request | Sync changed policy dates and prices |
| `BOOKING_CANCELLED` | A confirmed Offer is cancelled through an API request | Process the refund (`refund_value` on the quote) |
| `RENEWAL_CREATED` | The policy has been renewed | Record the renewed policy |
| `RENEWAL_NOTIFICATION` | A renewal is approaching | Remind the customer |
| `RENEWAL_DUE` | The renewal due date arrives; the policy stays active until the end of the grace period (`expiry_date`) | Prompt the customer to pay |
| `RENEWAL_EXPIRED` | The renewal expiry date arrives; the policy is no longer renewable | Mark the policy as lapsed |

## Event Payload Structure

Every body is `{ "event": "<EVENT_NAME>", "payload": { ... } }`.

Booking events (`BOOKING_CREATED`, `BOOKING_UPDATED`, `BOOKING_CANCELLED`):

```json
{
  "event": "BOOKING_CREATED",
  "payload": {
    "id": "8AMKH-KQ8NR-INS",
    "status": "CONFIRMED",
    "currency": "USD",
    "total_price": 68.71,
    "total_price_formatted": "US$68.71",
    "partner_transaction_id": null,
    "quotes": [
      {
        "id": "8bfb48ab-6947-4f34-a932-c4dcede958f6",
        "policy_start_date": "2023-10-08T00:00:49.751227+00:00",
        "policy_end_date": "2023-10-13T00:00:49.751247+00:00",
        "status": "CONFIRMED",
        "price": 68.71,
        "price_formatted": "US$68.71",
        "policy": { "policy_type": "travel_medical", "policy_name": "PolicyVersion 0", "policy_version": "e94df011-ee0b-44a1-bdb1-1dd05cb67fc7" },
        "duration": "5 00:00:00.000020",
        "total_renewed_times": 0
      }
    ]
  }
}
```

For `BOOKING_CANCELLED`, `status` is `CANCELLED` and each quote adds `refund_value`.

Renewal events (`RENEWAL_*`) carry `id`, `package_id`, `quote_id`, `status` (`ACTIVE` or `DUE` in
the docs' examples), `start_date`, `notification_date`, `due_date`, `expiry_date`,
`cancelled_on`, `paid_on` and `created_at`.

## Delivery and Retries

Cover Genius retries a webhook up to 3 times when your endpoint doesn't answer `200 OK`. Dedupe
on `payload.id` (plus `event`) so a retry doesn't repeat side effects.

## Full Event Reference

For the complete list of events and payloads, see the
[Cover Genius Webhooks documentation](https://partner-docs.covergenius.com/offers/api/webhooks).
