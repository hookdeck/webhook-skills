# SonarQube Webhooks Overview

## What Are SonarQube Webhooks?

SonarQube Server (the self-hosted code quality and security analysis server from SonarSource) notifies your application with an HTTP `POST` when a project analysis finishes. Use it to gate deployments, post results to chat, or open tickets when the quality gate fails.

Webhooks are configured per project (up to 10) or globally, in the UI or with the `api/webhooks` Web API, and all of them fire. Because SonarQube is self-hosted, every instance is its own sender.

## Events

SonarQube has **no event-name field or header**. Every delivery is an analysis result. Branch on `qualityGate.status`:

| `qualityGate.status` | Triggered When | Common Use Cases |
|----------------------|----------------|------------------|
| `OK` | The analysis passed the quality gate | Promote a build, post a success message |
| `ERROR` | The analysis failed the quality gate | Block a deploy, notify the owner, open a ticket |

## Payload Structure

SonarQube's documented example (it dates from 2016, and `serverUrl` is SonarQube's own placeholder):

```json
{
  "serverUrl": "<mySonarqubeURL>",
  "taskId": "AVh21JS2JepAEhwQ-b3u",
  "status": "SUCCESS",
  "analysedAt": "2016-11-18T10:46:28+0100",
  "revision": "c739069ec7105e01303e8b3065a81141aad9f129",
  "project": {
    "key": "myProject",
    "name": "My Project",
    "url": "https://mycompany.com/sonarqube/project/overview?id=myproject"
  },
  "properties": {},
  "qualityGate": {
    "conditions": [
      {
        "errorThreshold": "1",
        "metric": "new_security_rating",
        "onLeakPeriod": true,
        "operator": "GREATER_THAN",
        "status": "OK",
        "value": "1"
      },
      {
        "errorThreshold": "1",
        "metric": "new_reliability_rating",
        "onLeakPeriod": true,
        "operator": "GREATER_THAN",
        "status": "OK",
        "value": "1"
      },
      {
        "errorThreshold": "1",
        "metric": "new_maintainability_rating",
        "onLeakPeriod": true,
        "operator": "GREATER_THAN",
        "status": "OK",
        "value": "1"
      },
      {
        "errorThreshold": "80",
        "metric": "new_coverage",
        "onLeakPeriod": true,
        "operator": "LESS_THAN",
        "status": "NO_VALUE"
      }
    ],
    "name": "SonarQube way",
    "status": "OK"
  }
}
```

Main fields: `taskId` and `status` (the background task's ID and state, not the gate), `analysedAt`, `revision`, `project`, `qualityGate` and `properties` (any `sonar.analysis.*` parameters passed to the scanner). `qualityGate.status` is `OK` or `ERROR` in SonarQube's plugin API. Current SonarQube code also writes `changedAt` and, for branch and pull request analyses, a `branch` object, so parse defensively.

SonarQube also sends a delivery when an issue update changes the quality gate status. That delivery has the same shape, but SonarQube Cloud's docs say it has no `taskId`, which matches SonarQube's open-source payload code.

## Delivery Behavior

- A delivery fails if your URL does not respond within 10 seconds.
- SonarQube Server never retries a failed delivery. Its docs suggest building your own redelivery with the `api/webhooks` Web API, which returns past deliveries and their payloads.
- Delivery records are kept for 30 days.
- SonarQube Cloud sends the same payload and signature but retries some temporary failures (connection errors, `408`, `429`, `502`, `503`, `504`), at most 3 calls per event. It recommends deduplicating analysis deliveries on `taskId`.

## Full Reference

See the [SonarQube webhooks documentation](https://docs.sonarsource.com/sonarqube-server/project-administration/integrations/webhooks).
