# Openlayer Webhooks Overview

## What Are Openlayer Webhooks?

[Openlayer](https://openlayer.com) is an AI evaluation and observability platform. Webhooks let it notify your systems when something happens in a workspace, such as a test being created or a test suite finishing a run, instead of you polling the API. Openlayer sends an HTTP `POST` with a JSON body to each subscribed HTTPS endpoint. Deliveries follow the [Standard Webhooks](https://www.standardwebhooks.com/) specification and are signed with the subscription's `whsec_` secret.

Typical uses: alerting on-call engineers when tests start failing in production, triggering CI/CD or downstream jobs when a suite finishes, and syncing test definitions with your own systems.

## Event Payload Structure

Every body is `{ type, timestamp, data }`:

```json
{
  "type": "test.created",
  "timestamp": "2026-01-21T10:30:00Z",
  "data": {
    "test": {
      "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "number": 1,
      "name": "No duplicate rows",
      "type": "integrity",
      "subtype": "duplicateRowCount",
      "thresholds": [
        { "measurement": "duplicateRowCount", "operator": "<=", "value": 0 }
      ],
      "evaluationWindow": 3600,
      "archived": false
    }
  }
}
```

| Field | Meaning |
|-------|---------|
| `type` | The event type, for example `test.created`. This is what handlers switch on |
| `timestamp` | ISO 8601 (UTC) time at which the event was generated |
| `data` | Event-specific object: `data.test` for `test.*`, `data.tests` for `tests.result.updated` |
| `data.test.type` | The test's own category (for example `integrity`). Not the event type |

Payloads carry identifiers rather than every related object. Call the REST API with the IDs from the event when you need more.

The `webhook-id` header is unique per event and stays constant across retries, so it is the idempotency key.

## Event Types

| Event | Triggered When |
|-------|----------------|
| `test.created` | A test is created. `data.test` contains the full test definition |
| `test.updated` | A test's configuration is updated. `data.test` has the same structure as `test.created`, reflecting the new state |
| `test.deleted` | A test is deleted. `data.test` contains only the test `id` |
| `tests.result.updated` | A test suite finishes a run. One event per run, summarizing the results |

### tests.result.updated

This is the event to subscribe to if you want to alert when tests start failing. `data.tests` contains:

| Field | Meaning |
|-------|---------|
| `projectId` | The project the test suite belongs to |
| `projectVersionId` | The project version (commit) that was evaluated; may be `null` |
| `inferencePipelineId` | The inference pipeline that was evaluated, for monitoring runs; may be `null` |
| `total` | Total number of tests in the run |
| `passing` | Tests that passed |
| `failing` | Tests that failed |
| `skipped` | Tests that were skipped |
| `running` | Tests still running |

## Full Event Reference

These 4 events are those documented in [Events and payloads](https://docs.openlayer.com/security/webhooks/events). The list may not be exhaustive, so handlers should ignore types they don't recognise.
