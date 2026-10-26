# Azure DevOps Webhooks Overview

## What Are Azure DevOps Webhooks?

Azure DevOps sends events through **service hooks**. A subscription pairs an event (a trigger),
a consumer and an action. The **Web Hooks** consumer (consumer ID `webHooks`, action ID
`httpRequest`) POSTs a JSON representation of the event to any HTTPS URL. Payloads are not signed.
The subscription's basic authentication credentials are sent as `Authorization: Basic ...` so you
can confirm the request came from your subscription.

## Common Event Types

| Event (`eventType`) | Publisher | Triggered When | Common Use Cases |
|---------------------|-----------|----------------|------------------|
| `git.push` | `tfs` | Code is pushed to a Git repository | Trigger builds, sync mirrors |
| `git.pullrequest.created` | `tfs` | A pull request is created | Start review workflows |
| `git.pullrequest.updated` | `tfs` | A pull request is updated | Refresh review state |
| `git.pullrequest.merged` | `tfs` | A pull request is merged | Deploy, close tickets |
| `workitem.created` | `tfs` | A work item is created | Sync to another tracker |
| `workitem.updated` | `tfs` | A work item changes | Mirror field changes |
| `workitem.commented` | `tfs` | A work item is commented on | Sync comments |
| `build.complete` | `tfs` | A build completes | Notify, gate releases |
| `ms.vss-pipelines.run-state-changed-event` | `pipelines` | A pipeline run changes state | Track pipeline status |

Other events from the docs (all valid `eventType` values):

- Releases: `ms.azure-devops-release.release-created-event`, `...release-abandoned-event`,
  `...deployment-started-event`, `...deployment-completed-event`,
  `...deployment-approval-pending-event`, `...deployment-approval-completed-event`
- Pipelines: `ms.vss-pipelines.stage-state-changed-event`, `ms.vss-pipelines.job-state-changed-event`,
  `ms.vss-pipelinechecks-events.approval-pending`, `ms.vss-pipelinechecks-events.approval-completed`,
  `ms.vss-pipelinechecks-events.check-updated-event`, `manualintervention.pending`
- Agents: `elasticagentpool.resized`, `agentqueue.created`, `agentqueue.updated`
- Code: `tfvc.checkin`, `ms.vss-code.git-pullrequest-comment-event`, `git.repo.created`,
  `git.repo.deleted`, `git.repo.forked`, `git.repo.renamed`, `git.repo.statuschanged`
- Work items: `workitem.deleted`, `workitem.restored`
- Service connections: `ms.vss-endpoint.endpoint-created`, `ms.vss-endpoint.endpoint-updated`
- Advanced security: `ms.vss-alerts.alert-created-event`, `ms.vss-alerts.alert-state-changed-event`,
  `ms.vss-alerts.alert-updated-event`

## Event Payload Structure

Every payload is a JSON object:

| Field | Description |
|-------|-------------|
| `subscriptionId` | The subscription that fired (absent from some doc samples) |
| `notificationId` | Notification sequence number (absent from some doc samples) |
| `id` | Unique event ID |
| `eventType` | The event ID, such as `git.push` |
| `publisherId` | `tfs`, `rm`, `pipelines`, `distributedtask`, `advsec` |
| `message` | `{ text, html, markdown }` summary |
| `detailedMessage` | Same shape as `message`, with more detail |
| `resource` | Event-specific payload (shape depends on the event) |
| `resourceVersion` | Schema version of `resource`, such as `1.0` or `2.0` |
| `resourceContainers` | `collection`, `account` and `project` IDs (`id`, `baseUrl`) |
| `createdDate` | ISO 8601 timestamp |

The doc samples also show a `scope` field. The subscription's **Resource details to send**,
**Messages to send** and **Detailed messages to send** settings (`All`, `Minimal`, `None`) control
how much of `resource`, `message` and `detailedMessage` is included.

Trimmed `git.push` sample (from the docs):

```json
{
  "id": "a0a0a0a0-bbbb-cccc-dddd-e1e1e1e1e1e1",
  "eventType": "git.push",
  "publisherId": "tfs",
  "scope": "all",
  "message": { "text": "Jamal Hartnett pushed updates to branch main of repository Fabrikam-Fiber-Git." },
  "resource": {
    "refUpdates": [{ "name": "refs/heads/main" }],
    "repository": { "id": "f5f5f5f5-aaaa-bbbb-cccc-d6d6d6d6d6d6", "name": "Fabrikam-Fiber-Git" },
    "pushedBy": { "displayName": "Jamal Hartnett" },
    "pushId": 14
  },
  "resourceVersion": "2.0",
  "resourceContainers": { "project": { "id": "00aa00aa-bb11-cc22-dd33-44ee44ee44ee" } },
  "createdDate": "2024-09-19T13:03:27.0379153Z"
}
```

## Malformed Samples in the Docs

The events page's `build.complete` and `ms.azure-devops-release.deployment-approval-pending-event`
samples each contain **two JSON objects concatenated with no separator**, so they don't parse as
JSON (the two objects also disagree, for example on `publisherId`). Don't copy them into test
fixtures verbatim. Build fixtures from a single object, or capture a real delivery.

## Full Event Reference

For the complete list of events and payloads, see
[Azure DevOps service hooks events](https://learn.microsoft.com/en-us/azure/devops/service-hooks/events).
