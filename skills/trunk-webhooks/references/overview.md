# Trunk Webhooks Overview

## What Are Trunk Webhooks?

[Trunk](https://trunk.io/) is CI developer tooling. Two products send webhooks: **Merge Queue**
(PR and batch lifecycle events) and **Flaky Tests** (test status, monitor, quarantine and
AI-investigation events). Each subscribed endpoint receives an HTTPS `POST` with a signed JSON
payload. Deliveries go through [Svix](https://docs.svix.com/) and follow Standard Webhooks with the
`svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Delivery | Delivered by Svix; `svix-id` is stable across retries |
| Retries | Trunk retries with exponential backoff when the delivery provider rate-limits a request. No endpoint retry schedule or timeout is documented |

## Event Payload Structure

Bodies are flat: a top-level `type` (always equal to the event name) and `timestamp` (ISO 8601),
plus the resource fields. A Flaky Tests event:

```json
{
  "type": "v2.test_case.status_changed",
  "timestamp": "2026-08-25T11:40:32.000Z",
  "previous_status": "HEALTHY",
  "new_status": "FLAKY",
  "triggered_by": { "monitor_id": "0e6b1a9c-...", "monitor_type": "pass_on_retry", "monitor_status": "active" },
  "repository": { "id": "5b8f4c3e-...", "html_url": "https://github.com/acme-co/web" },
  "test_case": {
    "id": "7c1d9e52-...", "name": "checkout flow", "classname": "CheckoutTest",
    "file_path": "tests/checkout.test.ts", "html_url": "https://app.trunk.io/...",
    "codeowners": ["@acme-co/web"], "quarantined": false, "variant": ""
  }
}
```

- Merge Queue bodies carry `action` (the lifecycle step without the family prefix), `status`,
  `pr_number` and `repository`. `action` is not the event name: read `type`. The full JSON
  Schemas are in the Svix event catalog linked below.
- Collection events (test collections) carry the same types plus a `test_collection` object. That
  object is the supported way to tell them from repository events. `test_case.id` is **not**
  shared between the two, so don't deduplicate across them on it.
- There is no event id in the body: use the `svix-id` header to deduplicate.
- Order events by the payload `timestamp`, not receive time: retries and out-of-order delivery happen.

## Common Event Types

20 events are documented; the list may not be exhaustive. The examples handle exactly these and
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
| `v2.test_case.status_changed` | A test changes status, as triggered by a monitor (for example `new_status` is `FLAKY`) | `previous_status`, `new_status`, `triggered_by.monitor_id` / `.monitor_type` / `.monitor_status`, `repository`, `test_case` |
| `test_case.status_changed` | The original event, being phased out. Aggregate metrics such as `failure_rate_last_7d` are `0` or missing | as above |
| `test_case.monitor_status_changed` | A monitor activates or resolves for a test case | `monitor.id`, `monitor.type`, `monitor.status` (`active` or `resolved`), `evidence`, `repository`, `test_case` |
| `test_case.quarantining_setting_changed`, `v2.test_case.quarantining_setting_changed` | A quarantine setting is manually overridden to `ALWAYS_QUARANTINE` or `NEVER_QUARANTINE`. Does not fire on auto-quarantine (listen to `v2.test_case.status_changed` and check `new_status == "FLAKY"`) | `repository`, `test_case` |
| `test_case.investigation_completed` | An AI flaky-test analysis finishes (beta) | `investigation_id`, `trigger` (`AUTOMATIC`, `MANUAL` or `MCP`), `confidence`, `created_at`, `markdown_summary`, `failure_message`, `facts[]`, `repository`, `test_case` |

For "this test just became flaky", subscribe to `v2.test_case.status_changed`, not the
investigation event.

## Delivery Notes

- **Deduplicate on `svix-id`.** A retry after a timeout can arrive even though your handler
  already processed the message.
- Subscribe to **both** Merge Queue families explicitly. If only `pull_request.*` events arrive,
  you haven't enabled `pull_request_batch.*`.
- Acknowledge quickly, then do the work on a queue, so a slow dependency doesn't become a retry
  storm.

## Full Event Reference

For the complete catalog with JSON Schemas, see the
[Svix event catalog for Trunk](https://www.svix.com/event-types/us/org_2eQPL41Ew5XSHxiXZIamIUIXg8H/),
the [Flaky Tests webhooks guide](https://docs.trunk.io/flaky-tests/webhooks), the
[Merge Queue webhooks reference](https://docs.trunk.io/merge-queue/webhooks) and the
[webhooks reference](https://docs.trunk.io/setup-and-administration/apis/webhooks).
