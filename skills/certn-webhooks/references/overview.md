# Certn Webhooks Overview

## What Are Certn Webhooks?

Certn runs background checks. CertnCentric, its current platform and API, sends webhooks when a case or one of its checks changes, so you don't have to poll the API. Source: [CertnCentric API docs, Webhooks](https://centric-api-docs.certn.co/#webhooks).

## The Legacy API Is Gone

Certn deprecated its legacy API (`docs.certn.co/api`) on April 13, 2026 and turned it off on August 5, 2026. Since then legacy requests get `410 Gone` and legacy webhooks send nothing ([deprecation notice](https://docs.certn.co/api/deprecation)). If code still reads a `Certn-Signature` header or an applicant object with `report_status`, it was written for the legacy API. Webhook URLs, API keys, ATS integrations and SSO don't migrate to CertnCentric, so each has to be set up again.

## Event Types

| `event_type` | When |
|---|---|
| `CASE_STATUS_CHANGED` | A case's overall status changes |
| `CHECK_STATUS_CHANGED` | One check on a case changes status |
| `CASE_REPORT_READY` | A case report you requested is ready to retrieve |
| `CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED` | Certn generated new input claims for a case (some quickscreen checks only) |

Certn's API spec lists three more values for its events endpoint (`CREDENTIAL_REQUEST_STATUS_CHANGED`, `CREDENTIAL_REQUEST_INVITE_BOUNCED`, `VERIFIER_IS_ACTIVE_CHANGED`), but the Webhooks section doesn't list them. Log and acknowledge any `event_type` you don't handle.

## Payload

Bodies are JSON:

```json
{
  "created": "2024-06-27T12:00:00Z",
  "event_id": "1712aea0-77a4-425c-9649-7f544a3de477",
  "event_type": "CASE_STATUS_CHANGED",
  "object_id": "2f64d134-1c54-4028-8e8b-9cfa7bd8011c",
  "object_type": "CASE",
  "case_status": "CLIENT_ACTION_REQUIRED"
}
```

| Field | Meaning |
|---|---|
| `created` | When the event occurred (ISO 8601) |
| `event_id` | Unique ID for the event; deduplicate on it |
| `event_type` | One of the types above |
| `object_id` | The case ID for case-scoped events |
| `object_type` | `CASE` for case-scoped events |
| `case_status` | The case's rollup status when the webhook is delivered, retries included (for example `IN_PROGRESS`, `CLIENT_ACTION_REQUIRED`, `COMPLETE`) |
| `triggered_check` | On `CHECK_STATUS_CHANGED` when the event is tied to one check: `id`, `type`, `status` and, when the status is `CLIENT_ACTION_REQUIRED`, `action_required_resolution` |

`action_required_resolution` has an `action_id`, a `summary`, a `step_count` and ordered `steps`. Each step names the API call to make (`http_method`, `path`) and, for the respond step, the body it needs (`body_schema_key`, `body_schema_requirements`). Complete the steps in ascending `step` order.

Certn treats the contract as additive: new keys can appear, and resolution metadata leaves out keys that don't apply. Check that a key exists before you use it.

Because `case_status` and `triggered_check.status` reflect the state at delivery, a retried event carries the status at the time of the retry, not at the time of the event.

## Delivery

- Return `200` within 10 seconds, and process the event in a background job.
- Failed deliveries are retried with exponential backoff (30s, 90s, 270s and so on) for about two hours. Certn doesn't say which responses count as failures or what happens after the last retry.
- Retries can deliver events out of order.
- Each event has a unique `event_id`. Store the ones you've processed.
- `GET /api/public/events/` returns past events, with a `last_processed_event_id` parameter.

## API Limits That Affect Handlers

The API allows 60 requests per minute and 7,220 per day. A handler that fetches the case on every event can hit that during a burst, so queue the follow-up calls.
