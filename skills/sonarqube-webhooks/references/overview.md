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

```json
{
  "taskId": "AVh21JS2JepAEhwQ-b3u",
  "status": "SUCCESS",
  "analysedAt": "2026-10-26T09:30:00+0000",
  "project": { "key": "my_project", "name": "My Project" },
  "qualityGate": {
    "name": "Sonar way",
    "status": "ERROR",
    "conditions": [
      { "metric": "new_coverage", "operator": "LESS_THAN", "value": "62.5", "status": "ERROR", "errorThreshold": "80" }
    ]
  },
  "properties": {}
}
```

Main fields: `taskId`, `status` (the analysis task state), `analysedAt`, `project`, `qualityGate` and `properties`.

## Delivery Behavior

- A delivery fails if your URL does not respond within 10 seconds.
- Failed deliveries are never retried. Redeliver through the Web API if needed.
- Delivery records are kept for 30 days.

## Full Reference

See the [SonarQube webhooks documentation](https://docs.sonarsource.com/sonarqube-server/project-administration/integrations/webhooks).
