# Tensorlake Webhooks Overview

## What Are Tensorlake Webhooks?

[Tensorlake](https://www.tensorlake.ai/) is a document-ingestion and serverless sandbox /
application platform. Project-scoped webhooks send an HTTPS `POST` with a signed JSON payload
when sandboxes, applications, or application requests change state, so you can react to
lifecycle changes without polling. Each destination receives only the events produced by its
project and only the event types selected for it. Svix signs and delivers the messages, following
Standard Webhooks with the `svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx` acknowledges the attempt; Svix retries failed attempts |
| Delivery | At least once and unordered; `event_id` is stable across retries |
| Test deliveries | **Test webhook** on the destination's page sends a signed synthetic event through the normal path |

## Event Payload Structure

Every event arrives in the same versioned envelope. Only `data` differs between event types.

```json
{
  "event_id": "evt_019f95fb-7f33-7000-8000-000000000006",
  "event_type": "tensorlake.sandbox.failed",
  "event_version": 1,
  "occurred_at": "2026-07-24T21:15:15.123Z",
  "project_id": "project_123",
  "source_id": "src_01k0example",
  "source_revision": "81247",
  "source_ordinal": 0,
  "data": {
    "previous_status": "running",
    "sandbox": {
      "id": "9q2j1f4n6y8x0r3k5m7pa",
      "name": "build-runner",
      "type": "named",
      "image": "tensorlake/ubuntu-minimal",
      "generation_id": 2,
      "status": "terminated",
      "outcome": "failure",
      "outcome_reason": "out_of_memory",
      "snapshot_id": null,
      "created_at": "2026-07-24T20:10:00Z",
      "resources": { "cpus": 2, "memory_mb": 4096, "disk_mb": 20480, "gpu_count": 0, "gpu_model": null }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `event_id` | Stable identifier beginning with `evt_`; the deduplication key |
| `event_type` | One of the event names below |
| `event_version` | Payload schema version (currently `1`) |
| `occurred_at` | RFC 3339 UTC time the transition was recorded |
| `project_id` | Public ID of the producing project |
| `source_id` | Opaque identifier of the producer's ordering domain |
| `source_revision` | Unsigned decimal revision, kept as a **string** to avoid precision loss |
| `source_ordinal` | Zero-based order when one source revision produces several events |
| `data` | Event-specific sandbox, application, or request data |

## Common Event Types

| Event | Emitted When | `data` fields |
|-------|--------------|---------------|
| `tensorlake.sandbox.created` | A sandbox is persisted for the first time | `previous_status`, `sandbox` |
| `tensorlake.sandbox.running` | A sandbox enters the running state | same |
| `tensorlake.sandbox.suspended` | A sandbox enters the suspended state | same |
| `tensorlake.sandbox.resumed` | A suspended sandbox begins a new generation (public status starts as `pending`) | same |
| `tensorlake.sandbox.terminated` | A sandbox terminates without a failure outcome | same |
| `tensorlake.sandbox.failed` | A sandbox terminates with a failure outcome | same |
| `tensorlake.application.created` | An application is persisted for the first time | `previous_version` and `previous_state` (both `null`), `application` |
| `tensorlake.application.updated` | A deployment, metadata, capability, or state change is persisted | same |
| `tensorlake.application.deleted` | An existing application is deleted | same |
| `tensorlake.application.request.created` | An application request is created | `application`, `request` |
| `tensorlake.application.request.completed` | An application request completes | same |
| `tensorlake.application.request.failed` | An application request fails | same, with `request.failure_reason` |

12 events are documented; the list may not be exhaustive. The examples handle exactly these
events and acknowledge anything else with `200`.

Sandbox fields: `id`, `name`, `type` (`named` or `ephemeral`), `image`, `generation_id`,
`status` (`pending`, `running`, `suspended`, `terminated`), `outcome` (`success`, `failure`, or
`null`), `outcome_reason`, `snapshot_id`, `created_at`, `resources`. Application fields: `name`,
`version`. Request fields: `id`, `status`, `failure_reason`, `created_at`, `finished_at` (`null`
until the request finishes).

Sandbox failure reasons include `out_of_memory`, `timeout`, `internal_error`, `bad_image`,
`image_not_found`, `container_startup_failed`, and `process_crash`. Application-request failure
reasons are `unknown`, `internal_error`, `function_error`, `function_timeout`, `request_error`,
`constraint_unsatisfiable`, `cancelled`, and `out_of_memory`.

## Delivery Notes

- **Deduplicate on `event_id`.** Delivery is at least once, and the same event can arrive more
  than once.
- **Don't rely on order.** A later lifecycle event can arrive before an earlier one. When you need
  source order, compare `Number(source_revision)` (or `int(...)`), then `source_ordinal`, for
  events with the same `source_id`.
- Record accepted work durably before returning `2xx`, and do expensive work asynchronously.
- A `2xx` acknowledges the delivery attempt only; it doesn't change the Tensorlake resource.
- Delivery can be paused per destination (**Delivery enabled** switch).

## Full Event Reference

For the complete catalog and payload shapes, see Tensorlake's
[event reference](https://docs.tensorlake.ai/platform/webhooks/events) and
[webhooks overview](https://docs.tensorlake.ai/webhooks/overview).
