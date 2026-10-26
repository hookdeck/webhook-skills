# Spacebring Webhooks Overview

## What Are Spacebring Webhooks?

[Spacebring](https://www.spacebring.com) is a coworking and flexible-workspace management platform.
It sends an HTTPS `POST` to an endpoint you register when something changes in your network:
bookings, companies, events and tickets, memberships, locations, resources, shop orders,
subscriptions and visitors. Deliveries go through Svix and are signed. Webhooks need the
**API & webhooks add-on**.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` response |
| Retry schedule and timeout | Not stated in Spacebring's docs |
| Handshake | None documented |

## Event Payload Structure

Most event schemas have a top-level `type` string beside one resource object named for the domain:
`booking`, `company`, `event`, `ticket`, `membership`, `order` or `application`.

```json
{
  "type": "booking.created",
  "booking": { "id": "..." }
}
```

Caveats, all from Spacebring's webhook catalog:

- **The value of `type` is not documented.** The generated examples show "some string". Log a real
  delivery before relying on it, and don't assume it equals the event name in the catalog.
- **`subscription.*` bodies are the bare subscription object**, with no `type` and no wrapper key.
- **`visitors.*` bodies carry `visit` only**, with no `type`.
- **`location.*`, `resource.*` and `invoice.issued` have no schema** in the catalog.
- Svix's headers carry no event type, so a body without `type` can't be told apart by headers alone.

The examples in this skill switch on `type` when it matches a documented event name. For anything
else they return `200` and log it, so a different `type` value never causes retries.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `booking.created` | A booking is made | Sync to calendars, notify staff |
| `booking.updated` | A booking changes | Update calendars |
| `booking.deleted` | A booking is deleted | Free the resource |
| `booking.paid` | A booking is paid | Release access, mark paid |
| `membership.created` | A membership is created | Provision access |
| `membership.invited` | A member is invited | Track onboarding |
| `company.created` | A company is created | Create the account in your CRM |
| `shop.order.created` | A shop order is placed | Fulfilment |
| `shop.order.paid` | A shop order is paid | Confirm fulfilment |
| `subscription.purchased` | A subscription is purchased | Provision plan benefits |
| `invoice.issued` | An invoice is issued | Accounting sync |
| `visitors.visit.checked_in` | A visitor checks in | Notify the host |
| `support.ticket.created` | A support ticket is created | Route to a helpdesk |

## Full Event List (32 documented, may not be exhaustive)

- **Benefit:** `benefit.application.created`
- **Booking:** `booking.created`, `booking.deleted`, `booking.paid`, `booking.updated`
- **Company:** `company.created`, `company.deleted`
- **Event:** `event.canceled`, `event.created`, `event.deleted`, `event.updated`,
  `event.ticket.created`, `event.ticket.paid`
- **Invoice:** `invoice.issued`
- **Location:** `location.created`, `location.deleted`, `location.updated`
- **Membership:** `membership.created`, `membership.invited`
- **Resource:** `resource.created`, `resource.deleted`, `resource.updated`
- **Shop:** `shop.order.created`, `shop.order.paid`
- **Subscription:** `subscription.created`, `subscription.deleted`, `subscription.purchased`,
  `subscription.updated`
- **Support:** `support.ticket.created`
- **Visitors:** `visitors.request.approved`, `visitors.visit.checked_in`, `visitors.visit.checked_out`

The examples route all 32 and acknowledge anything else with `200`.

## Delivery and Idempotency

Endpoints must answer `POST` with a `2xx` status. Svix resends a message with the **same `svix-id`**
after a failure, so deduplicate on `svix-id` and make effects idempotent. Spacebring's docs don't state
a retry schedule, so don't depend on specific timings. Acknowledge fast and process on a queue.

## Full Event Reference

For payload schemas, see Spacebring's [webhook documentation](https://www.spacebring.com/docs/webhooks)
and its [event catalog](https://webhooks.spacebring.com/).
