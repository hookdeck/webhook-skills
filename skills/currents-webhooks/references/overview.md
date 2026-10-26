# Currents Webhooks Overview

## What Are Currents Webhooks?

Currents (currents.dev) is a dashboard for Playwright test runs. Its HTTP Webhook
integration sends a `POST` with a JSON payload to a publicly accessible URL you choose at each
run lifecycle event. Requests are not signed. Authenticity relies on a secret custom header you
configure, plus an unsigned `x-timestamp` header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `RUN_START` | A new run starts | Post "tests running" status, start a timer |
| `RUN_FINISH` | A run finishes | Notify a channel, update a PR or ticket, gate a deploy |
| `RUN_TIMEOUT` | A run times out | Alert on a stuck CI job |
| `RUN_CANCELED` | A run is canceled | Clear pending status |

Leaving the integration's **Events** field blank activates all four events. Runs with multiple
groups send one request per group; each payload carries its own `groupId`.

## Event Payload Structure

```json
{
  "event": "RUN_FINISH",
  "runUrl": "https://app.currents.dev/run/950a13c3edf4f28b6e8ce301a404b4aa",
  "buildId": "demo-build-cdx3314",
  "groupId": "chromium",
  "tags": ["smoke", "production"],
  "commit": {
    "authorEmail": "john@doe.com",
    "authorName": "John Doe",
    "defaultBranch": "main",
    "branch": "feature-A",
    "message": "feat: change button color",
    "remoteOrigin": "https://github.com/org/repo.git",
    "sha": "5a7edc9a156e417068060d67109021351fc7d9b8"
  },
  "overall": 24,
  "passes": 21,
  "failures": 2,
  "pending": 0,
  "skipped": 1,
  "retries": 3,
  "flaky": 1
}
```

| Field | Meaning |
|-------|---------|
| `event` | `RUN_START`, `RUN_FINISH`, `RUN_TIMEOUT` or `RUN_CANCELED` |
| `runUrl` | Currents dashboard URL for the run |
| `buildId` | Build ID as reported by CI |
| `groupId` | Only for multi-group runs |
| `tags` | Run tags plus tags on executed tests and groups |
| `commit` | `sha`, `branch`, `authorName`, `authorEmail`, `message`, `remoteOrigin`, `defaultBranch` (each may be `null`) |
| `overall` | Tests that reported a result |
| `passes`, `failures`, `pending`, `skipped` | Counters that add up to `overall` |
| `retries`, `flaky` | Retry attempts and flaky tests (`flaky` overlaps the other counters) |

`RUN_START`, `RUN_TIMEOUT` and `RUN_CANCELED` carry only the results known at that point, and a
`RUN_CANCELED` payload is a snapshot: tests in progress still finish, so counters can change
afterward. Read the run through the dashboard or API for final numbers.

## Full Event Reference

See [Currents' HTTP webhook documentation](https://docs.currents.dev/resources/integrations/http-webhooks).
