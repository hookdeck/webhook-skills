# Mindbody Webhooks Overview

## What Mindbody Sends

Each event is a `POST` with a JSON body and an `X-Mindbody-Signature` header. Mindbody also sends `HEAD` requests to check the URL when a subscription is created or changed. Webhook URLs must accept HTTPS with TLS 1.2 or higher.

## Envelope

| Field | Meaning |
|---|---|
| `messageId` | The event's unique ID: dedupe on it |
| `eventId` | The event type, as passed in a subscription's `eventIds` |
| `eventSchemaVersion` | Always `1` today |
| `eventInstanceOriginationDateTime` | When the business triggered the event (UTC) |
| `transactionKey` | Present when the event came from a Public API call that sent a `Transaction-Key` header |
| `eventData` | The event's object. Its shape depends on `eventId`, and it includes `siteId` |

Example `eventData` for `classRosterBooking.created` (abridged from the docs): `siteId`, `locationId`, `classId`, `classRosterBookingId`, `classStartDateTime`, `classEndDateTime`, `signedInStatus`, `staffId`, `staffName`, `maxCapacity`, client fields.

## Event Types

From the [Webhooks API docs](https://developers.mindbodyonline.com/WebhooksDocumentation):

| Area | Events |
|---|---|
| Site and locations | `site.created`, `site.updated`, `location.created`, `location.updated`, `siteBusinessDayClosure.created`, `siteBusinessDayClosure.cancelled` |
| Staff | `staff.created`, `staff.updated` |
| Classes | `classSchedule.created`, `classSchedule.updated`, `classSchedule.cancelled`, `class.updated`, `classDescription.updated` |
| Class bookings | `classRosterBooking.created`, `classRosterBooking.cancelled`, `classRosterBookingStatus.updated`, `classWaitlistRequest.created`, `classWaitlistRequest.cancelled` |
| Appointments | `appointmentBooking.created`, `appointmentBooking.updated`, `appointmentBooking.cancelled`, `appointmentAddOn.created`, `appointmentAddOn.deleted` |
| Clients | `client.created`, `client.updated`, `clientProfileMerger.created` |
| Sales and contracts | `clientSale.created`, `clientContract.created`, `clientContract.updated`, `clientContract.cancelled`, `clientMembershipAssignment.created`, `clientMembershipAssignment.cancelled` |

Check the docs for the current list before you subscribe.

## Delivery

- "Events are not guaranteed to be delivered only once" and "not guaranteed to be delivered in chronological order." Dedupe on `messageId` and order by `eventInstanceOriginationDateTime`.
- If Mindbody gets no 2xx within **10 seconds**, it resends the event **every 15 minutes** and stops after **3 hours**.
- If deliveries keep failing, Mindbody can deactivate the subscription and emails the developer account. Re-activate it with `PATCH` once the endpoint is fixed.
- Mindbody recommends queueing the event and responding right away, then processing it.
