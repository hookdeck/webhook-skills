# Breezy HR Webhooks Overview

## What Are Breezy HR Webhooks?

Breezy HR (a recruiting / applicant tracking system) pushes JSON events to your
HTTPS endpoint as they happen, so you do not have to poll the API. Webhooks are
available on Pro plans. Endpoints are created and managed through the Breezy API
(`/v3/company/{company_id}/webhook_endpoints`), and each endpoint subscribes to a
list of event types. Every delivery is signed in the `X-Hook-Signature` header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `candidateAdded` | A candidate enters the system (apply, source, recruit, refer) | Sync to HRIS, notify hiring team |
| `candidateStatusUpdated` | A candidate moves to another pipeline stage (not fired on first entry) | Trigger interview scheduling, background checks |
| `candidateDeleted` | A candidate is deleted in the web app (not fired by GDPR auto-delete) | Remove data from downstream systems |
| `companyPositionAdded` | A position is created | Post to job boards |
| `companyPositionUpdated` | Position details change (not state) | Refresh job listings |
| `companyPositionDeleted` | A position is deleted | Unpublish listings |
| `companyPositionStateUpdated` | Position state changes (draft, published, closed...) | Open / close listings |
| `companyNotePosted` | A team discussion note is posted | Notify channels |
| `companyNoteUpdated` | A team discussion note is edited | Keep notes in sync |
| `companyNoteDeleted` | A team discussion note is deleted | Keep notes in sync |

## Event Payload Structure

All events share one envelope:

```json
{
  "_id": "evt_id",
  "type": "candidateAdded",
  "object": { "company": {}, "position": {}, "candidate": {}, "acting_user": {} },
  "creation_date": "2026-01-05T19:26:51.000Z"
}
```

- `_id` - unique event ID; use it to deduplicate
- `type` - the event name from the table above
- `object` - event data. Candidate events carry `company`, `position`,
  `candidate`, `stage` (and `stage_was`, `time_in_previous_stage` on
  `candidateStatusUpdated`), `acting_user`, `source`. Position events carry
  `company`, `position`, `acting_user` (and `state_is` / `state_was` on
  `companyPositionStateUpdated`). Note events carry `company_id`, `position`,
  `candidate` and `note_id`.
- `creation_date` - when the event was created

## Delivery Behavior

- HTTPS only, public hosts only, 30 second timeout per attempt
- Any non-2xx response (or timeout) is a failure; 10 attempts with exponential
  backoff (1s, 2s, 4s, 8s, 16s, 32s, then 60s)
- Limit of 10 endpoints per customer
- Duplicates are possible; deduplicate on `_id`

## Full Event Reference

See [Breezy HR's webhook documentation](https://developer.breezy.hr/docs/webhooks)
and the [Webhook Events](https://developer.breezy.hr/docs/webhook-events) page.
