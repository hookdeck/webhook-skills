# WeTravel Webhooks Overview

## What Are WeTravel Webhooks?

WeTravel is a group travel booking and payments platform. Its webhooks let
enterprise clients and software partners keep internal systems (CRM, accounting,
operations) in sync with what happens on WeTravel: new and changed bookings,
payments, money movements, published trips and new leads.

Webhooks are **off by default**. They need a WeTravel API key, and only the
main account can manage them (see [setup.md](setup.md)). Endpoints are managed
in a Svix App Portal opened from **Manage Webhooks**, where each endpoint can
listen to all events or to specific event types.

## Event Types

This is the full list on WeTravel's
[webhooks page](https://developer.wetravel.com/v3/docs/webhooks):

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `booking.created` | New booking on a trip page or embedded widget; new booking via "Add Participant" in Manage Trip | Create the traveller in a CRM, send onboarding |
| `booking.updated` | Departure date changed; refund issued; booking canceled; "Add Participant" update; participant updates their info; custom price set; package switched; bulk action; eSignature received; new payment; payment failed or disputed; trip details updated; balance due adjusted; rebooking cancels the original booking | Keep booking status, balances and manifests current |
| `payment.created` | A new payment is initiated | Record a pending payment |
| `payment.updated` | Status changes pending → successful/failed or successful → refunded/disputed; payment moved to a new trip on rebooking | Reconcile payment status |
| `transaction.created` | Payment received; refund; dispute processed; payout or instant payout; card transfer; vendor payment; wire transfer; top-up received; balance adjusted by WeTravel | Post ledger entries to accounting |
| `transaction.updated` | Transaction moved to a new trip on rebooking | Re-attribute ledger entries |
| `trip.published` | Trip published in the trip builder or via the Trip Builder API | Publish the trip to your own site or catalog |
| `lead.created` | Brochure downloaded (website or trip page); question asked on a trip or profile page | Create a lead in a CRM |
| `lead.updated` | The same lead downloads another brochure or asks another question | Update lead activity |

`booking.updated` fires for many reasons and the event type alone doesn't say
which. Read the current state from the payload (or the WeTravel API) and make
your handler idempotent rather than branching on an assumed cause.

## Event Payload Structure

WeTravel doesn't publish payload schemas on its public docs. Schemas and samples
for every event are in **Manage Webhooks → Event Catalog**. As a Svix-delivered
webhook, the body is JSON in the usual Svix envelope:

```json
{
  "type": "booking.created",
  "data": { "...": "event-specific fields — see the Event Catalog" }
}
```

The handlers in this skill dispatch on `type` and read `data`. Check the Event
Catalog for the exact fields before relying on them.

Each delivery also carries a unique `svix-id` header. Use it as your
idempotency key: a retried delivery keeps the same `svix-id`.

## Full Event Reference

- [WeTravel webhooks documentation](https://developer.wetravel.com/v3/docs/webhooks)
- WeTravel dashboard → Manage Webhooks → Event Catalog (schemas and examples)
