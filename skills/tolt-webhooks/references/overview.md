# Tolt Webhooks Overview

## What Are Tolt Webhooks?

[Tolt](https://tolt.com) is affiliate and partner program software for SaaS. When something
happens in your program (a partner joins, a referred visitor signs up, a payment or commission is
recorded), Tolt sends a signed JSON `POST` to the endpoint URLs you register under
Settings → Webhooks. Deliveries go through [Svix](https://www.svix.com/), so they follow
Standard Webhooks and carry the `svix-id`, `svix-timestamp` and `svix-signature` headers.

## Event Payload Structure

Every event has the same envelope: `type`, `data` and `timestamp`. `data` is the same resource the
Tolt API returns, plus `organization_id`.

```json
{
  "type": "commission.created",
  "data": {
    "id": "comm_7XqLm2KwR9tZb4NvHc8YdFsJ",
    "amount": "980",
    "revenue": "4900",
    "currency": "usd",
    "status": "pending",
    "partner_id": "part_8fKq2LmZx7RtYw3nVbHc5dPj",
    "transaction_id": "txn_5MqRw9KxL2tZb8NvYc4HdFsJ",
    "organization_id": "org_7YtKm3QwZ9xRb2NvHc6LdPsF"
  },
  "timestamp": "2026-08-24T14:25:41.000Z"
}
```

- Money fields are strings in cents (`"980"` is $9.80), so parse them before doing math.
- There is **no event id** in the body. Use the `svix-id` header as the idempotency key.
- Order isn't guaranteed. Use `data.updated_at` to keep the newest version of a resource.

## Common Event Types

Five resources, each with a `.created` and an `.updated` event, following a referral from partner
to commission. There are no delete events. The list may not be exhaustive.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `partner.created` | A partner joins your program | Welcome email, CRM sync |
| `partner.updated` | A partner's details change, or they are approved, rejected or suspended | Gate access to partner tools |
| `link.created` | A referral link is created | Register the link in your own system |
| `link.updated` | A referral link is edited | Keep link records current |
| `customer.created` | A referred visitor signs up and is bound to a partner | Tag the user as referred |
| `customer.updated` | A customer's details or status change, for example a first payment makes them `active` | Track conversion |
| `transaction.created` | A payment is recorded for a referred customer | Revenue attribution |
| `transaction.updated` | A payment is edited or refunded | Flag refunds |
| `commission.created` | A partner earns a commission | Notify the partner |
| `commission.updated` | A commission is approved (by hand or after its approval delay), declined or edited | Queue payouts |

API refunds send `transaction.updated`, not `commission.updated`.

## Delivery Rules

- Respond fast: save or queue the event, return `2xx`, and do slow work afterwards.
- Failed or timed-out deliveries are retried; Tolt doesn't print the schedule.
- Delivery is at least once, so the same event can arrive twice. Deduplicate on `svix-id`.
- Transport is a signed JSON POST over HTTPS. Verify the signature before trusting the body
  (see [verification.md](verification.md)).

## Full Event Reference

See Tolt's [event types](https://docs.tolt.com/webhooks/event-types.md) and
[webhook introduction](https://docs.tolt.com/webhooks/introduction).
