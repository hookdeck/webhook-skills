# Recruitee Webhooks Overview

## What Are Recruitee Webhooks?

Recruitee sends an HTTP POST with a JSON body to your HTTPS URL whenever a
selected event happens (a candidate applies, moves stage, a job is published,
and so on). They can be used standalone or alongside the Recruitee JSON API.
Each request carries an `X-Recruitee-Signature` header so you can verify it.

## Common Event Types

| `event_type` | `event_subtype` | Triggered When | Common Use Cases |
|--------------|-----------------|----------------|------------------|
| `new_candidate` | `email`, `career_site`, `manual`, `imported` | A new candidate applies or is created | Notify recruiters, sync to CRM/HRIS |
| `candidate_assigned` | `email`, `career_site`, `manual`, `imported` | A new or existing candidate is assigned to a job or talent pool | Track applications per job |
| `candidate_moved` | `stage_changed`, `disqualified`, `requalified` | A candidate moves pipeline stage, is disqualified, or requalified | Pipeline analytics, Slack alerts, onboarding on `hire` stage |
| `candidate_deleted` | `manual` | A candidate is deleted | GDPR erasure in downstream systems |
| `offer_published` | `manual` | A job is published | Job board / career page sync |
| `offer_unpublished` | `manual` | A job is unpublished or archived | Remove listings |
| `offer_updated` | `offer_changed`, `status_changed`, `tags_changed` | A job is updated | Keep job data in sync |

There is no `candidate_disqualified` event type. Disqualification is
`candidate_moved` with `event_subtype: "disqualified"`.

## Event Payload Structure

```json
{
  "id": 75,
  "attempt_count": 1,
  "created_at": "2020-12-12T00:30:01.860998Z",
  "event_type": "candidate_moved",
  "event_subtype": "stage_changed",
  "payload": {
    "candidate": { "id": 21056, "name": "John Doe", "emails": [], "phones": [], "source": "manual" },
    "company": { "id": 1, "name": "Devtest Company" },
    "details": {
      "from_stage": { "id": 5716, "name": "Applied", "category": "apply" },
      "to_stage": { "id": 4110, "name": "Phone interview", "category": "phone_screen" }
    },
    "offer": { "id": 617, "kind": "job", "slug": "cruiser-captain", "title": "Cruiser Captain" }
  }
}
```

| Field | Description |
|-------|-------------|
| `id` | Uniquely identifies the event. Retries reuse it |
| `attempt_count` | Delivery attempts so far, starting at 1 |
| `created_at` | ISO 8601 UTC time the event happened (unchanged on retries) |
| `event_type` / `event_subtype` | Which event, and how it came about |
| `payload` | Event data: `candidate`, `company`, `offer` (or `offers`), `details`, `placement_locations` depending on the event |

For `candidate_moved`, `payload.details` is `{from_stage, to_stage}` for
`stage_changed`, `{to_stage, disqualify_reason}` for `disqualified`, and
`{to_stage}` for `requalified`.

## Test Request

The **Test** button and **Verify and create** send `{"test":true}` with
`Content-Type: application/json` and `User-Agent: Recruitee-Webhooks`. Answer
200. The **Test payload** buttons send example event payloads that also carry
the test parameter.

## Full Event Reference

For the complete list of events, see [Recruitee's webhook documentation](https://docs.recruitee.com/docs/webhooks).
