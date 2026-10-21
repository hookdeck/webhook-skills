# Guesty Webhooks Overview

## What Are Guesty Webhooks?

Guesty is a property management platform for short-term rentals. Its Open API
can push real-time notifications to your HTTPS endpoint when reservations,
listings, guests, payments, calendars, tasks, or messages change. Delivery,
signing, retries, and replay are handled by [Svix](https://www.svix.com/).

Guesty recommends treating webhooks as change notifications: after receiving
one, fetch the latest object from the Open API and compare it with your stored
copy. Payloads (especially v2 ones) are intentionally lean.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `reservation.created.v2` | A booking request or instant booking is created | Sync new bookings, trigger guest communications |
| `reservation.updated.v2` | Stay details change (excludes folio and payments) | Update dates/status; `meta.changedFields` and `meta.subType` describe the change |
| `reservation.new` | Legacy: booking created (full reservation object) | Existing integrations not yet on v2 |
| `reservation.updated` | Legacy: stay, folio, or payment changed | Existing integrations; includes `reservationBefore` |
| `listing.new` | A listing is created | Add inventory to your system |
| `listing.updated` | A listing's settings or content change | Re-sync listing content |
| `listing.removed` | A listing is deleted | Remove inventory |
| `guest.created` | A guest record is created | CRM sync |
| `payments.received` | A reservation payment succeeds | Accounting, receipts |

### Full Event List

From Guesty's [Subscribe to webhooks](https://open-api-docs.guesty.com/docs/webhooks) table and the
[create subscription](https://open-api-docs.guesty.com/reference/accountsWebhookCreate) enum:

- **Reservations:** `reservation.created.v2`, `reservation.updated.v2`, `reservation.new`, `reservation.updated`, `reservation_update_shortlist`
- **Messages:** `reservation.messageReceived`, `reservation.messageSent`
- **Payments:** `payments.authenticationRequired`, `payments.authorizationHoldFailed`, `payments.disputes`, `payments.failed`, `payments.method.received`, `payments.overcharged`, `payments.overcharge.expected`, `payments.invalidPaymentMethod`, `payments.overdue`, `payments.received`, `payments.refunded`
- **Listings:** `listing.new`, `listing.updated`, `listing.removed`
- **Calendar:** `listing.calendar.updated`, `calendar.updated.v2`
- **Tasks:** `task.created`, `task.updated`, `task.deleted`
- **Guests:** `guest.created`, `guest.updated`, `guest.deleted`
- **Financials:** `guest-folio.created`, `guest-folio.updated`

Event names are case-sensitive and mix conventions (`reservation_update_shortlist`,
`guest-folio.created`, `payments.method.received`). Copy them exactly. The
legacy reservation events (`reservation.new`, `reservation.updated`,
`reservation_update_shortlist`) are being phased out by the end of February 2027
and new subscriptions to them may need allowlist approval from Guesty.

## Event Payload Structure

The event name is always in the top-level `event` field. The object lives under
a key that depends on the event family.

Reservation v2:

```json
{
  "event": "reservation.updated.v2",
  "data": {
    "reservationId": "6a96ae8ea07eac3dcadf0aab",
    "accountId": "66053c21dd2adbdfb3b383b7",
    "status": "confirmed",
    "checkInDateLocalized": "2026-09-16",
    "checkOutDateLocalized": "2026-09-20",
    "confirmationCode": "GY-pCCSraYC"
  },
  "meta": {
    "eventId": "f0aa793e-a132-4fba-a0d6-8ac8c421442a",
    "publishedAt": "2026-09-01T11:27:50.039Z",
    "changedFields": ["notes"],
    "subType": "NOTES_ALTERED"
  }
}
```

Legacy reservation and listing events:

```json
{
  "event": "listing.updated",
  "listing": { "_id": "...", "title": "..." },
  "meta": { "eventId": "<event_id>", "messageId": "<message_id>" }
}
```

| Field | Present on | Notes |
|-------|-----------|-------|
| `event` | All | Event name |
| `meta.eventId` | Most events (reservation, listing) | Use for deduplication alongside `svix-id` |
| `meta.publishedAt` | Reservation v2 | Use for ordering |
| `data` | Reservation v2 | Lean reservation details (`reservationId`) |
| `reservation` / `reservationBefore` | Legacy reservation | Full object; `reservationBefore` on updates |
| `listing` | Listing events | Listing object |
| `guest`, `by` | Guest events | Guest record and who created it |
| `payment` | Payment events | Payment details (`reservationId`, `amount`, `currency`) |

Guest examples in Guesty's docs show no `meta` block, so do not assume
`meta.eventId` is always there; `svix-id` always is.

## Ordering and Duplicates

Events are processed asynchronously, can arrive out of order, and recovery
processes may re-send historical events. Guesty's guidance:

- Deduplicate on `svix-id` and `meta.eventId`.
- Order by `__v` or `lastUpdatedAt` in the data (or `meta.publishedAt` on v2).
- Let freshly fetched API data drive your state, not event order.

Guesty notes that a single reservation change can produce two or three webhooks
with different content.

## Delivery and Retries

- Respond with `2xx` within about 15 seconds; any other status (including `3xx`) is a failure.
- Retries: immediately, 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, 10 hours.
- Failed messages can be replayed from the webhooks dashboard (Developer tools → Webhooks).
- An endpoint failing for 5 days is automatically disabled; contact Guesty API Support to re-enable it.

## Full Event Reference

- [Subscribe to webhooks](https://open-api-docs.guesty.com/docs/webhooks)
- [Reservation webhooks](https://open-api-docs.guesty.com/docs/webhooks-reservations)
- [Property (listing) webhooks](https://open-api-docs.guesty.com/docs/webhooks-listings)
- [Guest webhooks](https://open-api-docs.guesty.com/docs/webhooks-guests)
- [Payment webhooks](https://open-api-docs.guesty.com/docs/webhooks-payments)
- [Reservation webhooks migration guide](https://open-api-docs.guesty.com/docs/reservation-webhooks-migration-guide)
