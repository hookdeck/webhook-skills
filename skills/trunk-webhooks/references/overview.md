# Trunk Webhooks Overview

## What Are Trunk Webhooks?

[Trunk](https://trunk.io/) is CI developer tooling. Two products send webhooks: **Merge Queue**
(PR and batch lifecycle events) and **Flaky Tests** (test status, monitor and quarantine events).
Each subscribed endpoint receives an HTTPS `POST` with a signed JSON payload. Deliveries go through
[Svix](https://docs.svix.com/) and follow Standard Webhooks with the `svix-*` header names, which
Trunk's [route-flaky-tests recipe](https://docs.trunk.io/flaky-tests/recipes/route-flaky-tests-to-owners)
passes to the `svix` library.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Delivery | Delivered by Svix; `svix-id` is stable across retries |
| Retries | Trunk retries with exponential backoff when the delivery provider rate-limits a request. Trunk doesn't restate an endpoint schedule; Svix's default is immediately, then 5 s, 5 min, 30 min, 2 h, 5 h, 10 h and 10 h, with a 30-second response window |

## Event Payload Structure

Bodies are flat: a top-level `type` (always equal to the event name) and `timestamp` (ISO 8601),
plus the resource fields. The catalog's example of a Flaky Tests event:

```json
{
  "new_status": "FLAKY",
  "previous_status": "HEALTHY",
  "repository": {
    "html_url": "https://github.com/trunk-io/flaky-tests",
    "id": "a6ea3bad-a0a4-4366-9223-ac74efccb928"
  },
  "test_case": {
    "classname": "ItsAlwaysSunnyOnEarth.Tests.AlwaysSunnyTest",
    "codeowners": [],
    "failure_rate_last_7d": 0.18,
    "file_path": "",
    "html_url": "https://app.trunk.io/trunk/flaky-tests/collections/T8GDWWwY/tests/bfeebcf4-72d1-887d-8bcd-788d0dec7f97",
    "id": "bfeebcf4-72d1-887d-8bcd-788d0dec7f97",
    "name": "AlwaysSunnyTest.TestWeather_Beijing",
    "parent": "ItsAlwaysSunnyOnEarth.Tests.dll",
    "pull_requests_impacted_last_7d": 4,
    "quarantined": false,
    "variant": ""
  },
  "test_collection": {
    "html_url": "https://app.trunk.io/trunk/flaky-tests/collections/T8GDWWwY",
    "id": "T8GDWWwY"
  },
  "timestamp": "2026-03-27T12:28:40.695Z",
  "triggered_by": {
    "monitor_id": "d6edf0b8-2f2b-4caf-8f36-038668585cf6",
    "monitor_status": "active",
    "monitor_type": "failure_rate"
  },
  "type": "v2.test_case.status_changed"
}
```

- Merge Queue bodies carry `action` (the lifecycle step without the family prefix), `status`,
  `pr_number` and `repository`. `action` is not the event name: read `type`. The full JSON
  Schemas are in the Svix event catalog linked below.
- The Flaky Tests page says every event carries a `test_collection` object, while the catalog says
  it's absent on repository-scoped `v2.test_case.status_changed` events. Treat it as optional.
  `test_case.id` differs between collection and repository events, so don't deduplicate across
  them on it.
- There is no event id in the body: use the `svix-id` header to deduplicate.
- Order events by the payload `timestamp`, not receive time: retries and out-of-order delivery happen.

## Common Event Types

17 events are documented; the list may not be exhaustive. The examples handle exactly these and
acknowledge anything else with `200`.

### Merge Queue

| Event | Triggered When |
|-------|----------------|
| `pull_request.queued` | The PR is added to the queue. `queued_reason` is `BISECTION_REQUIRED` when it enters bisection and `BISECTION_TEST_RUN_PASSED` when it returns to the queue |
| `pull_request.submitted` | The PR is submitted to the queue |
| `pull_request.testing` | Trunk starts testing the PR, alone or in a batch (a 4-PR batch sends four) |
| `pull_request.merged` | The PR merged after a clean run |
| `pull_request.failed` | The PR was kicked from the queue (fires per PR) |
| `pull_request.pending_failure` | The PR has a pending failure |
| `pull_request.canceled` | The PR was canceled |
| `pull_request_batch.queued`, `.submitted`, `.testing`, `.merged`, `.failed`, `.canceled`, `.pending_failure` | Same lifecycle for a batch of PRs tested together. `pull_request_batch.pending_failure` does not always lead to bisection |

There is no `bisection_completed` event: watch `queued_reason` on `pull_request.queued`.

### Flaky Tests

| Event | Triggered When | Key fields |
|-------|----------------|------------|
| `v2.test_case.status_changed` | A test changes status between `HEALTHY`, `FLAKY` and `BROKEN`, as triggered by a monitor | `previous_status`, `new_status`, `triggered_by.monitor_id` / `.monitor_type` / `.monitor_status`, `repository`, `test_case` (with `failure_rate_last_7d` and `pull_requests_impacted_last_7d`) |
| `test_case.monitor_status_changed` | A monitor activates or resolves for a test case | `monitor.id`, `monitor.type`, `monitor.status` (`active` or `inactive`), `evidence`, `repository`, `test_case` |
| `v2.test_case.quarantining_setting_changed` | Someone sets a manual `ALWAYS_QUARANTINE` or `NEVER_QUARANTINE` override, including one that re-applies the current value. Does not fire on auto-quarantine (listen to `v2.test_case.status_changed` and check `new_status == "FLAKY"`) | `previous_quarantining_setting`, `updated_quarantining_setting`, `reason`, `actor`, `test_collection`, `repository`, `test_case` |

The catalog listed `test_case.status_changed`, `test_case.quarantining_setting_changed` and
`test_case.investigation_completed` until November 2026. They're no longer documented.

## Delivery Notes

- **Deduplicate on `svix-id`.** Trunk's recipe notes that webhooks can arrive late or be retried,
  and a retry after a timeout can arrive even though your handler already processed the message.
- Subscribe to **both** Merge Queue families explicitly. If only `pull_request.*` events arrive,
  you haven't enabled `pull_request_batch.*`.
- Acknowledge quickly, then do the work on a queue, so a slow dependency doesn't time out the
  delivery.

## Full Event Reference

For the complete catalog with JSON Schemas, see the
[Svix event catalog for Trunk](https://www.svix.com/event-types/us/org_2eQPL41Ew5XSHxiXZIamIUIXg8H/),
the [Flaky Tests webhooks guide](https://docs.trunk.io/flaky-tests/webhooks), the
[Merge Queue webhooks reference](https://docs.trunk.io/merge-queue/webhooks) and the
[webhooks reference](https://docs.trunk.io/api/webhooks).
