# Harbor Webhooks Overview

## What Are Harbor Webhooks?

Harbor is an open source container registry. If you are a project administrator you can
configure webhooks on a project, and Harbor then notifies your endpoint of certain events in
that project. The docs describe them as delivered by "HTTP or HTTPS POST" with JSON bodies, so
you can, for example, trigger a build and deployment whenever an image changes.

Webhooks carry no signature and no timestamp. The only authentication is the optional Auth
Header you set on the webhook, which Harbor sends as the `Authorization` header (see
[verification.md](verification.md)). Harbor re-sends a notification that fails or gets a non-2xx
response, using the retry configuration in `harbor.yml`, so make handlers idempotent.

## What Events Does Harbor Send?

| Event | Webhook event type | Default `type` | CloudEvents `type` |
|-------|--------------------|----------------|--------------------|
| Push artifact to registry | `PUSH_ARTIFACT` | `PUSH_ARTIFACT` | `harbor.artifact.pushed` |
| Pull artifact from registry | `PULL_ARTIFACT` | `PULL_ARTIFACT` | `harbor.artifact.pulled` |
| Delete artifact from registry | `DELETE_ARTIFACT` | `DELETE_ARTIFACT` | `harbor.artifact.deleted` |
| Artifact scan completed | `SCANNING_COMPLETED` | `SCANNING_COMPLETED` | `harbor.scan.completed` |
| Artifact scan stopped | `SCANNING_STOPPED` | `SCANNING_STOPPED` | `harbor.scan.stopped` |
| Artifact scan failed | `SCANNING_FAILED` | `SCANNING_FAILED` | `harbor.scan.failed` |
| Project quota exceeded | `QUOTA_EXCEED` | `QUOTA_EXCEED` | `harbor.quota.exceeded` |
| Project quota near threshold | `QUOTA_WARNING` | `QUOTA_WARNING` | `harbor.quota.warned` |
| Artifact replication status changed | `REPLICATION` | `REPLICATION` | `harbor.replication.status.changed` |
| Artifact tag retention finished | `TAG_RETENTION` | `TAG_RETENTION` | `harbor.tag_retention.finished` |

## What Are the Two Payload Formats?

For the HTTP notify type you choose **Default** or **CloudEvents** when you create the webhook
(the Slack type always sends rich text, not covered here).

**Default** (the format that has always existed):

```json
{
  "type": "PUSH_ARTIFACT",
  "occur_at": 1680501893,
  "operator": "harbor-jobservice",
  "event_data": {
    "resources": [
      {
        "digest": "sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4",
        "tag": "sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4",
        "resource_url": "localhost/harbor/alpine@sha256:954b378c375d852eb3c63ab88978f640b4348b01c1b3456a024a81536dafbbf4"
      }
    ],
    "repository": {
      "date_created": 1680501893,
      "name": "alpine",
      "namespace": "harbor",
      "repo_full_name": "harbor/alpine",
      "repo_type": "private"
    }
  }
}
```

**CloudEvents** (CloudEvents 1.0 envelope, same content under `data`):

```json
{
  "specversion": "1.0",
  "id": "66e18103-09c1-41f6-982f-37df223f3eeb",
  "requestid": "51c0b694-0168-4f3c-b0db-282565455d7b",
  "source": "/projects/2/webhook/policies/15",
  "type": "harbor.artifact.pushed",
  "datacontenttype": "application/json",
  "time": "2023-04-03T06:04:46Z",
  "data": { "resources": ["..."], "repository": { "repo_full_name": "harbor/alpine" } },
  "operator": "harbor-jobservice"
}
```

Dispatch on `type` in both cases. Tell the formats apart by `specversion` (present only in
CloudEvents); the event content is `event_data` in Default and `data` in CloudEvents.

## Event Payload Fields

- `occur_at` (Default only): Unix seconds. CloudEvents uses an RFC 3339 `time`.
- `operator`: the user, robot account or component that caused the event (`harbor-jobservice`,
  `auto`, `MANUAL`, or empty for `QUOTA_EXCEED`).
- `resources[]`: `digest`, `tag`, `resource_url` for artifact events. `SCANNING_*` events add
  `scan_overview` keyed by report media type (`scan_status`, `severity`, `summary`, `scanner`).
- `repository`: `name`, `namespace`, `repo_full_name`, `repo_type`.
- `QUOTA_EXCEED` and `QUOTA_WARNING`: `custom_attributes.Details` describes the limit.
- `REPLICATION`: a `replication` object (`job_status`, `src_resource`, `dest_resource`,
  `successful_artifact`).
- `TAG_RETENTION`: a `retention` object (`total`, `retained`, `project_name`, `result`,
  `deleted_artifact`).

## Full Reference

See Harbor's documentation: https://goharbor.io/docs/main/working-with-projects/project-configuration/configure-webhooks/
