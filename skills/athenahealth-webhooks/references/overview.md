# athenahealth Webhooks Overview

## What Are athenahealth Webhooks?

The athenahealth Event Subscription Platform delivers near real-time healthcare domain events (appointments, encounters, lab results, patients, and more) to an HTTPS endpoint you register. It largely follows the FHIR Subscriptions R5 Backport IG on FHIR R4, with differences in error handling. Only the `rest-hook` channel type and the `id-only` payload type are supported, and the Subscription and SubscriptionTopic endpoints were in limited alpha rollout when the README was written.

You subscribe per **topic** and per **practice** by creating a FHIR `Subscription`. athenahealth then POSTs a notification Bundle to your endpoint whenever a matching event occurs. Authenticity is checked with the `X-Hub-Signature` header (see [verification.md](verification.md)).

## Common Event Types

The topic name is the last path segment of `entry[0].resource.topic` in the Bundle.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Appointment.schedule` | An appointment is scheduled | Reminders, calendar sync |
| `Appointment.cancel` | An appointment is cancelled | Free the slot, notify staff |
| `Appointment.reschedule` | An appointment is rescheduled | Update calendars |
| `Appointment.check-in` | A patient checks in | Front-desk workflows |
| `Appointment.update` | An appointment changes | Keep a local copy in sync |
| `Encounter.check-in` | An encounter is checked in | Start clinical workflows |
| `Encounter.signoff` | An encounter is signed off | Billing, documentation hand-off |
| `LabResult.create` | A lab result document is created | Notify clinicians |
| `LabResult.close` | A lab result is closed | Close tasks |
| `Patient.create` / `Patient.update` | A patient record is created or changed | Sync patient data |

Other topics in the README include `Appointment.check-out`, `Appointment.freeze`, `Appointment.unfreeze`, `Claim.create`, `Order.submit`, `Prescription.create`, `Provider.update`, `PatientProblem.create`, and more, grouped by resource (AdminDocument, Appointment, Claim, ClinicalDocument, ClinicalEncounterDiagnosis, Encounter, HistoricalMedication, HistoricalVaccine, ImagingResult, LabResult, Letter, MedicalRecord, Order, Patient, PatientCase, PatientInfoOrder, PatientProblem, Prescription, Provider, ReferringProvider, and others). Discover what is available with `GET /fhir/r4/SubscriptionTopic`.

## Event Payload Structure

The request body is a FHIR `Bundle` with `type: "history"`:

- `entry[0].resource` is a `SubscriptionStatus` (`type: "event-notification"`) with:
  - `topic` - URL ending in the topic name, e.g. `https://api.platform.athenahealth.com/fhir/r4/SubscriptionTopic/Patient.update`
  - `subscription.reference` - e.g. `Subscription/a9c3784c-9f56-4b32-95b0-882868d39e58`
  - `eventsInNotification` - number of events, always equal to the length of `notificationEvent`
  - `notificationEvent[]` - one object per event: `id` (unique event ID, equals the matching `AuditEvent.id`), `eventNumber`, `timestamp` (when the event happened), and `focus`
  - `focus.reference` - FHIR reference such as `Patient/a-432.E-528595` (when the resource has a FHIR R4 endpoint)
  - `focus.identifier` - proprietary athenahealth reference such as `{ "system": "urn:athenahealth:athenanet:patient:432", "value": "528595" }` (when available)
- Every further entry is an `AuditEvent` (one per notification event) with the acting user, practice, topic-specific extensions such as `ah-department`, and the entity reference.

A Bundle may batch several events for one topic. `eventsSinceSubscriptionStart`, `eventsInNotification`, and `eventNumber` are relative to the current Bundle, not a running counter.

Because the payload is `id-only`, call a FHIR R4 or athenahealth API endpoint with the `focus` reference to read the current resource. This keeps PHI behind athenahealth's API access controls.

## Delivery Semantics

- Your endpoint must respond with a 2xx within **2 seconds** (hard limit). Queue the Bundle and process it asynchronously.
- Delivery is at-least-once: dedupe on `notificationEvent[].id`.
- Ordering is not guaranteed. Fetch the current resource instead of relying on event order.
- Non-2xx responses and timeouts are retried. The README says failures are retried for up to 1 hour and kept in a dead letter queue replayable for up to 7 days (its timeout section says up to 7 days).
- Your endpoint must use HTTPS on port 443 with a valid certificate from a widely trusted CA.

## Full Event Reference

For the complete list of topics, filters, and the API endpoint to read each resource, see the [athenahealth subscription topics](https://github.com/athenahealth/aone-fhir-subscriptions/blob/main/README.md#subscription-topics).
