# Semble Webhooks Overview

## What Are Semble Webhooks?

Semble is practice management and EHR software for clinics. Its API is GraphQL, and webhooks are subscriptions you create with the `createWebhook` mutation: a `label`, an HTTPS `url`, and the `eventTypes` you want. Delivery is a `POST` with a JSON body, signed with `X-Webhook-Signature`. Webhooks must be enabled for your practice first (contact Semble support), and your API token needs the webhook permissions (`seeWebhooks`, `createWebhooks`, `editWebhooks`, `deleteWebhooks`).

Events don't overlap: subscribing to `booking.updated` does not deliver `booking.patientJourney.arrived`. Subscribe to each event type you want.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `booking.created` | An appointment was created | Sync calendars, send reminders |
| `booking.updated` | An appointment was updated | Reschedule downstream records |
| `booking.deleted` | An appointment was deleted | Cancel downstream records |
| `booking.patientJourney.arrived` | Patient marked as arrived | Front-desk displays |
| `booking.patientJourney.completed` | Patient marked as completed | Follow-up workflows |
| `contact.created` | A practice contact (GP, insurer, payor) was created | CRM sync |
| `invoice.paid` | An invoice was fully paid | Reconciliation, receipts |
| `invoice.partiallyPaid` | A payment reduced but did not clear the balance | Payment tracking |
| `patient.created` | A patient was created | Onboarding, CRM sync |
| `resourceAvailability.updated` | An availability or unavailability rule was updated | Keep an external booking page in step |

Other groups: availability, clinical report, episode, lab, letter, location, pathway, patient document, payment on account, prescription, product, questionnaire, and webhook (`webhook.event.deliveryFailed`, `webhook.subscription.updated`).

## Event Payload Structure

```json
{
  "subscriptionId": "692597070fe21cfa5e6a010f",
  "eventId": "692597070fe21cfa5e6a010a",
  "eventType": "booking.created",
  "identifiers": {
    "bookingId": "507f1f77bcf86cd799439011",
    "patientId": "507f191e810c19729de860ea",
    "doctorId": "507f1f77bcf86cd799439012"
  }
}
```

| Field | Description |
|-------|-------------|
| `subscriptionId` | The subscription that received the event |
| `eventId` | Unique ID for this delivery attempt |
| `eventType` | Lowercase dotted event type string |
| `identifiers` | String IDs of related records; optional keys are omitted, not `null` |
| `metadata` | Optional event-specific fields; omitted when unused |

The payload carries IDs, not the record. Fetch the record with the GraphQL API using the identifier.

## Delivery and Retries

Failed deliveries are retried a number of times before being marked `failed`. If delivery to a URL repeatedly fails, Semble sets the subscription to `deliveryPaused: true` and emails the practice's Technical Contact; paused events can be replayed from the Webhook Logs page. Events from the last 30 days are in the logs.

## Full Event Reference

For the complete list of events and identifiers, see [Semble's webhook events documentation](https://docs.semble.io/docs/webhooks/events/).
