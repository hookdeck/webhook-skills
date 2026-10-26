# Thinkific Webhooks Overview

## What Are Thinkific Webhooks?

Thinkific is an online course platform. Webhooks POST a JSON event to your URL when something
happens on one Thinkific site: a lead, order, transaction, subscription, user, enrollment, course,
lesson, quiz, product or app-uninstall event. You register a webhook per topic through the Webhooks
API or the admin UI. Each request is signed with an `X-Thinkific-Hmac-Sha256` header (see
[verification.md](verification.md)).

## Event Types

The topic is `resource.action`. Thinkific documents 27 topics; the examples handle the `order`,
`order_transaction`, `enrollment`, `user` and `course` resources and log the rest.

| Topic | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `order.created` | A student places an order | Fulfilment, sales records |
| `order_transaction.succeeded` / `order_transaction.failed` / `order_transaction.refunded` | A payment succeeds, fails or is refunded | Payment state, revenue reporting |
| `enrollment.created` / `enrollment.completed` / `enrollment.progress` / `enrollment.trial` | A student enrols, finishes, progresses or starts a trial | Grant access, certificates, nudges |
| `user.signup` / `user.signin` / `user.updated` / `user.deleted` | A user signs up, signs in, is updated or deleted | CRM sync, GDPR deletion |
| `course.created` / `course.updated` / `course.deleted` | A course changes | Catalogue sync |
| `lesson.completed` / `quiz.attempted` | A student completes a lesson or attempts a quiz | Progress tracking |
| `product.created` / `product.updated` / `product.deleted` / `plan.updated` | Catalogue changes | Pricing and product sync |
| `subscription.past_due` / `subscription.cancelled` / `subscription.unpaid` | A subscription changes state | Dunning, access removal |
| `lead.created` | A lead is captured | Email marketing |
| `app.uninstalled` | An OAuth app is uninstalled | Clean up tokens |
| `cart.abandoned` | A cart is abandoned | Recovery emails |

## Event Payload Structure

```json
{
  "id": "20180126172320940835610",
  "resource": "order",
  "action": "created",
  "tenant_id": "3",
  "created_at": "2018-01-26T22:23:20.808Z",
  "payload": { "id": 19796, "order_number": 1010, "amount_cents": 5000, "product_name": "Introduction to Webhooks" }
}
```

(Abridged from the docs' `order.created` sample.)

- `resource` and `action` name the topic; `payload` is the object (an order, user, enrollment, ...).
- Newer events also carry `tenant_global_id` and a numeric `timestamp`. These are unsigned body fields.
- `cart.abandoned` uses a different, versioned envelope with `name` and `data` instead of
  `resource`, `action` and `payload`.
- The `X-Thinkific-Topic` header also carries a topic, but its only documented example is
  `orders.created` (plural), so dispatch on the body.

## Delivery

- A 2xx within 5 seconds acknowledges the delivery.
- Otherwise Thinkific retries up to 14 times over about 16 hours (10 s, 30 s, 1 min, 2 min, ...,
  1 h at the 11th, 8 h at the 14th). Webhooks that keep failing may be deactivated.
- Delivery logs are kept 30 days. Make handlers idempotent (key on the event `id`).

## Full Event Reference

See [Thinkific's webhook documentation](https://support.thinkific.dev/hc/en-us/articles/4422685850775).
