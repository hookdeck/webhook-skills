# Supertab Webhooks Overview

## What Are Supertab Webhooks?

[Supertab](https://supertab.co/) provides micropayments and paywall tooling for publishers:
purchases, time passes and One-Time Offerings. It sends an HTTPS `POST` with a signed JSON payload
to each endpoint a merchant registers when something happens in the account, for example when a
customer completes a purchase. Deliveries go through Svix and follow Standard Webhooks with the
`svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` |
| Delivery | By Svix. Supertab states no retry schedule, timeout or ordering, so treat it as at-least-once and deduplicate on `svix-id` |

## Event Payload Structure

Every event arrives as `{ "type": "...", "data": { ... } }`. Both fields are required. The
`purchase.completed` payload also carries a top-level `metadata` object (empty in the catalog
example).

`purchase.completed`:

```json
{
  "type": "purchase.completed",
  "metadata": {},
  "data": {
    "id": "purchase.bc5a1f06-07a7-46af-8907-e3a79e7d7a78",
    "offering_id": "offering.39e953e5-3b82-461e-bd7d-7b0c764e5b10",
    "description": "1 Minute Time Pass",
    "purchased_at": "2025-05-15T12:24:04.074314Z",
    "completed_at": "2025-05-15T12:24:04.097598Z",
    "price": {
      "amount": 25,
      "currency": { "base_unit": 100, "code": "USD", "name": "US Dollar", "symbol": "$" }
    },
    "user": { "id": "user.9125c850-7fe2-4350-9b6a-52fe9ea844d5", "email": "test@supertab.co", "first_name": "Test", "last_name": "User" },
    "entitlement_status": {
      "content_key": "site.02acc452-e808-428f-8c64-0a5311d142bb",
      "has_entitlement": true,
      "expires": "2025-05-15T12:25:04.074314Z",
      "recurs_at": null
    },
    "metadata": { "title": "Test Page", "url": "https://www.supertab.co/" }
  }
}
```

`onetime_offering.purchasing_completed`:

```json
{
  "type": "onetime_offering.purchasing_completed_2025-04-01",
  "data": {
    "id": "onetime_offering.a3c0753a-2894-5cfb-8bba-976553b9fe42",
    "status": "purchasing_completed",
    "metadata": {},
    "price": { "amount": 2.99, "currency": { "base_unit": "100", "code": "USD", "name": "US Dollar", "symbol": "$" } },
    "items": [
      {
        "id": "onetime_offering_item.4f2be578-a7de-7b3e-a2a2-9c34cbcc585f",
        "description": "First item",
        "metadata": { "action": "Promotions" },
        "price": { "amount": 2.99, "currency": { "base_unit": "100", "code": "USD", "name": "US Dollar", "symbol": "$" } },
        "purchase": { "id": "...", "status": "completed", "purchased_at": "...", "completed_at": "..." }
      }
    ]
  }
}
```

- The catalog's schemas describe `price.amount` as "expressed in currency base units", but its two
  examples use different shapes (`25` with `base_unit: 100`, and `2.99` with `base_unit: "100"`).
  Don't assume one numeric convention without checking a real delivery.
- The `purchase.completed_2025-04-01` catalog example carries `"type": "purchase.completed"`
  with **no** version suffix. The examples therefore strip a trailing `_YYYY-MM-DD` and switch on
  the base name, so both forms work.
- There is no event id in the body: use the `svix-id` header to deduplicate.
- No header carries the event type: read `type` from the body.

## Common Event Types

| Event | Triggered When | Key `data` fields |
|-------|----------------|-------------------|
| `purchase.completed_2025-04-01` | A purchase is completed | `id`, `offering_id`, `description`, `price`, `user`, `entitlement_status`, `metadata`, `purchased_at`, `completed_at` |
| `onetime_offering.purchasing_completed_2025-04-01` | The purchase of a One-Time Offering is fully completed | `id`, `status`, `metadata`, `price`, `items[]` |

Two events are documented; the list may not be exhaustive, so the examples handle exactly these
and acknowledge anything else with `200`.

## Event Versioning

Webhook events are versioned. The version is appended to the event type name and is visible in the
event list when you register an endpoint (`_2025-04-01` is the current latest). A new version is
released when a payload change is breaking, such as a removed or changed field. Adding a field
doesn't create a new version. An event type without a version is the oldest version of that event.
Subscribe to the version you coded against.

## Example Use Cases

- **CRM updates:** on `purchase.completed`, write the customer's purchase to your CRM.
- **Custom access management:** create One-Time Offerings that carry your own `metadata`
  (for example access or credits), and on `onetime_offering.purchasing_completed` check the
  metadata before granting access.

## Delivery Notes

- Supertab states no retry schedule, timeout or ordering. Return `2xx` as soon as the signature
  checks out and do the work on a queue.
- Deduplicate on `svix-id`, which is stable across retries of the same message.

## Full Event Reference

For the complete catalog and payload schemas, see Supertab's
[webhook guide](https://docs.supertab.co/merchant-api/webhooks/consuming-webhooks) and its
[event catalog](https://www.svix.com/event-types/eu/org_2m1kyxXSEnLSeEprUkWs7ksPdgf/), also shown
under the *Event Catalog* tab of *Webhooks* in the Business Portal.
