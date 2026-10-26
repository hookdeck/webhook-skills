# Delivereasy Webhooks Overview

## What Are Delivereasy Webhooks?

Delivereasy (delivereasy.co.nz) is a New Zealand food delivery and last-mile courier company. Lastmile
API partners receive a webhook each time a booking changes stage. A Delivereasy representative
configures the URL, one for staging and one for production.

> Only Lastmile webhooks are supported: paste your Delivereasy API key. Marketplace webhooks (X-Delivereasy-Signature) aren't covered.

## What Gets Sent?

There is no event-name field or header. Every delivery is the booking resource itself, so dispatch on
`status`.

| Field | Meaning |
|-------|---------|
| `id` | Booking id (deduplicate on this) |
| `booking_identifier` | Booking reference |
| `status` | Current booking stage; dispatch on this |
| `driver` | Assigned driver details |
| `pickup` / `dropoff` | Addresses and details for each leg |

The list of `status` values is not reproduced here; take it from the
[Delivereasy webhook docs](https://developer.delivereasy.co.nz/intro/webhooks) and your account's API reference.

## Delivery Behavior

- Method: `POST`.
- Return `200` as soon as the webhook arrives and process asynchronously.
- At least once: the same booking can arrive more than once, so deduplicate on the booking `id`.
- Retry schedule and timeout are not documented.

## Marketplace Webhooks

Delivereasy Marketplace webhooks (`X-Delivereasy-Signature`, hex HMAC-SHA256, separate webhook secret
for API version 2025-01-01) are out of scope for this skill.

## Full Reference

[Delivereasy webhooks documentation](https://developer.delivereasy.co.nz/intro/webhooks)
