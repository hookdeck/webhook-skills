# Workable Webhooks Overview

## What Are Workable Webhooks?

Workable lets you register a subscription (`POST /subscriptions` in the Workable API) so it POSTs a resource to your endpoint when an event fires. Candidate events can be filtered by job and/or stage. Your endpoint should answer `200`, otherwise Workable treats the delivery as failed and replays it.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `candidate_created` | A candidate is created | Sync to ATS/CRM, notify recruiters |
| `candidate_moved` | A candidate moves to another stage | Trigger interview scheduling, offers |
| `employee_created` | An employee record is created | Provision accounts in HRIS/IT |
| `employee_updated` | An employee record changes | Keep directories in sync |
| `employee_published` | An employee record is published | Onboarding workflows |

Also documented by Workable: `candidate_deleted`, `job_deleted`, `onboarding_completed`, `timeoff_updated`. You subscribe to `timeoff_updated`, but Workable's examples arrive with an `event_type` of `timeoff_request_approved` or `timeoff_request_reverted`.

## Event Payload Structure

For candidate events Workable POSTs a Candidate object, similar to the candidate details API response. The payload reflects the state at the time of the request, not when the event fired, so race conditions can make it slightly different. Employee and time off events are described on Workable's employee events page. Every body has `id`, `resource_type`, `event_type`, `fired_at` and `data`, and the example handlers route on `event_type`. Workable's candidate field table calls `id` the event identifier, but its employee examples reuse the same `id` across different events, so don't deduplicate on `id` alone.

## Full Event Reference

See [Workable's webhook subscriptions documentation](https://workable.readme.io/reference/webhook-subscriptions-candidates-employees).
